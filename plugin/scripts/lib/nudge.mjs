// Stop-hook logic for opt-in auto mode: once the session's context passes a
// threshold, ask Claude (once) to write a handover and tell the user to /clear.
// Hooks get no token count, so the size is read from the transcript: the last
// main-thread assistant call's input + cache tokens is the context it carried.
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { slugify, storeRoot } from "./store.mjs";
import { fileURLToPath } from "node:url";
import { autoEnabled, headless, relayOn } from "./auto-flag.mjs";

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

export { autoEnabled };

// The plugin option nudge_at, which Claude Code passes to hooks only once the
// user has set it (and bounds to 50000-1000000 itself).
export const NUDGE_AT_OPTION = "CLAUDE_PLUGIN_OPTION_NUDGE_AT";

// CLEAR_RESUME_NUDGE_AT wins when it is a usable number, then the plugin option,
// then the default. A bad value falls through rather than turning the nudge off.
export function threshold(env) {
  for (const raw of [env.CLEAR_RESUME_NUDGE_AT, env[NUDGE_AT_OPTION]]) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_THRESHOLD;
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
  if (input.stop_hook_active) return null; // Claude is already continuing from a Stop hook
  const sessionId = slugify(input.session_id ?? "");
  if (!sessionId) return null;

  const tokens = lastContextTokens(input.transcript_path);
  const limit = threshold(env);
  if (tokens == null || tokens < limit) return null;

  if (!claimNudge(env, sessionId)) return null;

  if (headless(env)) {
    return {
      systemMessage: `clear-resume: context is about ${k(tokens)} tokens (nudge at ${k(limit)}). Claude is asked to commit and save a handover; the runner resumes it.`,
      hookSpecificOutput: { hookEventName: "Stop", additionalContext: headlessAsk(tokens, limit, "") },
    };
  }

  // Not `decision: "block"`: Claude Code 2.1.283 shows a block as "Stop hook
  // error: ...", which reads as a crash. Stop's additionalContext still keeps
  // the turn going so Claude can act, with the same stop_hook_active loop guard,
  // but is labelled "Stop hook feedback". systemMessage is the user's own line.
  return {
    systemMessage: userLine(env, tokens, limit, "Claude is asked to save a handover"),
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext:
        `clear-resume auto mode: this session's context is about ${k(tokens)} tokens (threshold ${k(limit)}). ` +
        `If the current task is finished or at a clean stopping point, write a handover now with the /clear-resume:handover skill, ` +
        `${afterSave(env)} ` +
        `If you are mid-task, finish the current step first, or tell the user why a clear should wait. ` +
        `This reminder fires once per session.`,
    },
  };
}

// Under the headless runner (run.mjs) there is no user to /clear: the process
// ending is the clear and the runner starts the next segment from the handover.
// A finished task must NOT save one, or the runner resumes a done job: the Stop
// hook fires on the final turn end too.
const SAVE_SCRIPT = fileURLToPath(new URL("../save.mjs", import.meta.url));
function headlessAsk(tokens, limit, midTurn) {
  return (
    `clear-resume headless mode: this session's context is about ${k(tokens)} tokens (threshold ${k(limit)}).${midTurn} ` +
    `If your task is finished, do not save a handover: just end, and the run stops. ` +
    `Otherwise: commit all your work on your branch now, then save a handover by running ` +
    `node "${SAVE_SCRIPT.replace(/\\/g, "/")}" --title "<short title>" with the handover markdown on stdin (a quoted heredoc). ` +
    `It must name the single next action, and copy any open STOP question verbatim. ` +
    `Then end your turn with no further tool calls. The runner starts a fresh session from that handover. ` +
    `This reminder fires once per session.`
  );
}

// The line the user sees. Plain and calm on purpose: it is a status note, not a fault.
function userLine(env, tokens, limit, ask) {
  const then = relayOn(env) ? "and the relay then clears and continues by itself" : "then you can type /clear";
  return `clear-resume: context is about ${k(tokens)} tokens (nudge at ${k(limit)}). ${ask}, ${then}.`;
}

// What Claude does once the handover is saved. With the relay on (hooks/relay.ts)
// the mod runs /clear when the turn ends, so Claude must end the turn rather than
// hand the user a /clear to type.
function afterSave(env) {
  return relayOn(env)
    ? `then end your turn with no further tool calls: the relay clears the session and continues from the handover by itself.`
    : `then tell the user to type /clear: the handover loads by itself in the fresh session.`;
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

  if (headless(env)) {
    return {
      systemMessage: `clear-resume: context is about ${k(tokens)} tokens (nudge at ${k(limit)}). Claude is asked to commit and save a handover when this step is done; the runner resumes it.`,
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: headlessAsk(tokens, limit, " This turn is still running: finish the current step first, but do not start new work."),
      },
    };
  }

  return {
    systemMessage: userLine(env, tokens, limit, "Claude is asked to save a handover when this step is done"),
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext:
        `clear-resume auto mode: this session's context is about ${k(tokens)} tokens (threshold ${k(limit)}), ` +
        `and this turn is still running. Compaction does not wait for a turn to end, so finish the current step, ` +
        `then write a handover with the /clear-resume:handover skill, ${afterSave(env)} ` +
        `Do not abandon work in progress to do it. This warning fires once per session.`,
    },
  };
}
