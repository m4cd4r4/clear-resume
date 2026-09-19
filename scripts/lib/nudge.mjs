// Stop-hook logic for opt-in auto mode: once the session's context passes a
// threshold, ask Claude (once) to write a handover and tell the user to /clear.
// Hooks get no token count, so the size is read from the transcript: the last
// main-thread assistant call's input + cache tokens is the context it carried.
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { slugify, storeRoot } from "./store.mjs";

export const DEFAULT_THRESHOLD = 180_000;
const TAIL_BYTES = 1024 * 1024;

// Context size of the last main-thread assistant call, or null if none found.
// Reads only the file's tail: transcripts reach hundreds of MB.
export function lastContextTokens(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  const fd = openSync(transcriptPath, "r");
  let text;
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    text = buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    let row;
    try {
      row = JSON.parse(lines[i]);
    } catch {
      continue; // blank line, or a line cut in half by the tail read
    }
    if (row.type !== "assistant" || row.isSidechain) continue;
    const u = row.message?.usage;
    if (!u || row.message?.model === "<synthetic>") continue;
    return (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  }
  return null;
}

export function autoEnabled(env) {
  return /^(1|true|on|yes)$/i.test(String(env.CLEAR_RESUME_AUTO ?? "").trim());
}

export function threshold(env) {
  const n = Number(env.CLEAR_RESUME_NUDGE_AT);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_THRESHOLD;
}

const k = (n) => `${Math.round(n / 1000)}k`;

export function runStop(input, { env = process.env } = {}) {
  if (!autoEnabled(env)) return null;
  if (input.stop_hook_active) return null; // Claude is already continuing from a Stop block
  const sessionId = slugify(input.session_id ?? "");
  if (!sessionId) return null;

  const tokens = lastContextTokens(input.transcript_path);
  const limit = threshold(env);
  if (tokens == null || tokens < limit) return null;

  const marks = join(storeRoot(env), ".nudged");
  const mark = join(marks, sessionId);
  if (existsSync(mark)) return null; // once per session, never a loop
  mkdirSync(marks, { recursive: true });
  writeFileSync(mark, new Date().toISOString(), "utf8");

  return {
    decision: "block",
    reason:
      `clear-resume auto mode: this session's context is about ${k(tokens)} tokens (threshold ${k(limit)}). ` +
      `If the current task is finished or at a clean stopping point, write a handover now with the /handover skill, ` +
      `then tell the user to type /clear: the handover loads by itself in the fresh session. ` +
      `If you are mid-task, finish the current step first, or tell the user why a clear should wait. ` +
      `This reminder fires once per session.`,
  };
}
