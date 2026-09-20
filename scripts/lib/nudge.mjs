// Stop-hook logic for opt-in auto mode: once the session's context passes a
// threshold, ask Claude (once) to write a handover and tell the user to /clear.
// Hooks get no token count, so the size is read from the transcript: the last
// main-thread assistant call's input + cache tokens is the context it carried.
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { slugify, storeRoot } from "./store.mjs";

export const DEFAULT_THRESHOLD = 180_000;
// A screenshot read is a single JSONL line of base64 megabytes, so a fixed tail
// can land wholly inside one line and parse nothing - returning null, which
// looks exactly like "no assistant calls" and skips the nudge in silence. Start
// small for the usual case and grow only when nothing parsed.
const TAIL_STEPS = [256 * 1024, 1024 * 1024, 4 * 1024 * 1024, 16 * 1024 * 1024];

function readTail(transcriptPath, bytes) {
  const fd = openSync(transcriptPath, "r");
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    return { text: buf.toString("utf8"), whole: start === 0 };
  } finally {
    closeSync(fd);
  }
}

function scan(text) {
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

// Context size of the last main-thread assistant call, or null if none found.
// Reads the file's tail, growing it: transcripts reach hundreds of MB.
export function lastContextTokens(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  for (const bytes of TAIL_STEPS) {
    const { text, whole } = readTail(transcriptPath, bytes);
    const found = scan(text);
    if (found != null) return found;
    if (whole) return null; // read the entire file and there is genuinely none
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

// True the first time this session claims the nudge. Both nudges share the mark
// so the user is interrupted once per session, whichever trigger gets there.
function claimNudge(env, sessionId) {
  const marks = join(storeRoot(env), ".nudged");
  const mark = join(marks, sessionId);
  if (existsSync(mark)) return false;
  mkdirSync(marks, { recursive: true });
  writeFileSync(mark, new Date().toISOString(), "utf8");
  return true;
}

export function runStop(input, { env = process.env } = {}) {
  if (!autoEnabled(env)) return null;
  if (input.stop_hook_active) return null; // Claude is already continuing from a Stop block
  const sessionId = slugify(input.session_id ?? "");
  if (!sessionId) return null;

  const tokens = lastContextTokens(input.transcript_path);
  const limit = threshold(env);
  if (tokens == null || tokens < limit) return null;

  if (!claimNudge(env, sessionId)) return null;

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

// PostToolUse: the Stop hook only runs when a turn ends, so a single long
// tool-heavy turn can cross the threshold and be compacted without it ever
// getting a chance. This one warns mid-turn instead. It never blocks - a tool
// result is the wrong place to interrupt work - and it never asks for the turn
// to be abandoned, only for a handover at the next clean point.
export function runMidTurn(input, { env = process.env } = {}) {
  if (!autoEnabled(env)) return null;
  const sessionId = slugify(input.session_id ?? "");
  if (!sessionId) return null;

  const tokens = lastContextTokens(input.transcript_path);
  const limit = threshold(env);
  if (tokens == null || tokens < limit) return null;
  if (!claimNudge(env, sessionId)) return null;

  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext:
        `clear-resume auto mode: this session's context is about ${k(tokens)} tokens (threshold ${k(limit)}), ` +
        `and this turn is still running. Compaction does not wait for a turn to end, so finish the current step, ` +
        `then write a handover with the /handover skill and tell the user to type /clear: the handover loads by ` +
        `itself in the fresh session. Do not abandon work in progress to do it. This warning fires once per session.`,
    },
  };
}
