// Stop-hook logic for opt-in auto mode: once the session's context passes a
// threshold, ask Claude (once) to write a handover and tell the user to /clear.
// Hooks get no token count, so the size is read from the transcript: the last
// main-thread assistant call's input + cache tokens is the context it carried.
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, writeFileSync } from "node:fs";
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

// The VS Code footer's nudge picker writes relay/<key>.nudge.json ({ limit, at })
// for a window, <key> being the relay file whose chain holds this session. It
// wins over the environment, so a change applies to the running session and to
// the sessions the relay continues it into. Missing or unusable: null.
export function windowNudgeAt(env, sessionId) {
  if (!sessionId) return null;
  try {
    const dir = join(storeRoot(env), "relay");
    // A reload writes a new relay file for the same session, with no choice of its
    // own, so the newest choice on any file holding this session wins.
    let best = null;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json") || /\.(set|handover|nudge)\.json$/.test(name)) continue;
      try {
        const file = JSON.parse(readFileSync(join(dir, name), "utf8"));
        if (!Array.isArray(file?.sessions) || !file.sessions.includes(sessionId) || typeof file.key !== "string") continue;
        const j = JSON.parse(readFileSync(join(dir, `${file.key}.nudge.json`), "utf8"));
        const n = Number(j?.limit);
        if (!(Number.isFinite(n) && n >= 50_000 && n <= 1_000_000)) continue;
        const at = Number(j?.at) || 0;
        if (!best || at > best.at) best = { n, at };
      } catch {
        // A file with no choice, or half written: look at the next.
      }
    }
    return best ? best.n : null;
  } catch {
    // No relay folder: use the environment.
  }
  return null;
}

// The window override wins, then CLEAR_RESUME_NUDGE_AT when it is a usable
// number, then the plugin option, then the default. A bad value falls through
// rather than turning the nudge off.
export function threshold(env, sessionId) {
  for (const raw of [windowNudgeAt(env, sessionId), env.CLEAR_RESUME_NUDGE_AT, env[NUDGE_AT_OPTION]]) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_THRESHOLD;
}

const k = (n) => `${Math.round(n / 1000)}k`;

// The .nudged mark holds { asks, tokens }: how many times Claude was asked in
// this session and the context size at the last ask. A mark written by an older
// build is a bare timestamp and counts as one ask.
function readMark(env, sessionId) {
  const mark = join(storeRoot(env), ".nudged", sessionId);
  if (!existsSync(mark)) return null;
  const raw = readFileSync(mark, "utf8");
  try {
    const m = JSON.parse(raw);
    if (Number.isFinite(m?.asks)) return { asks: m.asks, tokens: Number(m.tokens) || 0 };
  } catch {
    // A bare timestamp from an older build is not JSON.
  }
  return { asks: 1, tokens: 0 };
}

function writeMark(env, sessionId, mark) {
  const marks = join(storeRoot(env), ".nudged");
  mkdirSync(marks, { recursive: true });
  writeFileSync(join(marks, sessionId), JSON.stringify({ ...mark, at: new Date().toISOString() }), "utf8");
}

// True the first time this session claims the nudge. Both nudges share the mark,
// so the first ask is made once per session, whichever trigger gets there.
function claimNudge(env, sessionId, tokens) {
  if (readMark(env, sessionId)) return false;
  writeMark(env, sessionId, { asks: 1, tokens });
  return true;
}

// Every ask carries this line, so the next Stop can find the last one in the
// transcript and see what Claude did after it.
const ASK_MARK = "clear-resume auto mode";
export const MAX_ASKS = 3;
// After Claude answers without saving, ask again only once the context has grown by this much.
const ANSWERED_GROWTH = 40_000;
const FINISHED_REPLY = "Nothing to hand over.";
const DEFER_REPLY = "Handover not yet:";

// What Claude did since the last ask, read from the transcript tail: "saved" (a
// handover skill or save.mjs call), "finished" or "deferred" (it replied with one
// of the two answers the ask offers), or null (neither, as if it never saw it).
export function answerSince(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  for (const bytes of TAIL_STEPS) {
    const { text, whole } = readTail(transcriptPath, bytes);
    const lines = text.split("\n");
    let at = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(ASK_MARK)) {
        at = i;
        break;
      }
    }
    if (at < 0) {
      if (whole) return null;
      continue;
    }
    let answer = null;
    for (const line of lines.slice(at + 1)) {
      if (!line.includes('"type":"assistant"')) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (row.isSidechain) continue;
      for (const b of row.message?.content ?? []) {
        if (b.type === "tool_use") {
          const cmd = `${b.input?.skill ?? ""} ${b.input?.command ?? ""}`;
          if ((b.name === "Skill" && /handover/.test(cmd)) || (b.name === "Bash" && /save\.mjs/.test(cmd))) return "saved";
        } else if (b.type === "text") {
          if (b.text.includes(FINISHED_REPLY)) answer = "finished";
          else if (b.text.includes(DEFER_REPLY)) answer = answer ?? "deferred";
        }
      }
    }
    return answer;
  }
  return null;
}

export function runStop(input, { env = process.env } = {}) {
  if (!autoEnabled(env)) return null;
  if (input.stop_hook_active) return null; // Claude is already continuing from a Stop hook
  const sessionId = slugify(input.session_id ?? "");
  if (!sessionId) return null;

  const tokens = lastContextTokens(input.transcript_path);
  const limit = threshold(env, sessionId);
  if (tokens == null || tokens < limit) return null;

  if (!claimNudge(env, sessionId, tokens)) {
    // Asked before. Under the headless runner the process ending is the answer.
    if (headless(env)) return null;
    return remind(env, sessionId, input.transcript_path, tokens, limit);
  }

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
        (relayOn(env)
          ? `${RELAY_FINISHED}Otherwise, at a clean stopping point, write a handover now with the /clear-resume:handover skill, `
          : `If the current task is finished or at a clean stopping point, write a handover now with the /clear-resume:handover skill, `) +
        `${afterSave(env)} ` +
        `If you are mid-task, finish the current step first, then save, or reply "${DEFER_REPLY} <reason>". ` +
        `If this is asked again at a turn end, it is because you neither saved nor replied.`,
    },
  };
}

// The ask was made and Claude neither saved nor answered it: ask again at this
// turn end, up to MAX_ASKS in all. An answer ("Nothing to hand over." or "Handover
// not yet: ...") holds the next ask back until the context has grown by
// ANSWERED_GROWTH; a saved handover ends the asks (the relay clears on it).
function remind(env, sessionId, transcriptPath, tokens, limit) {
  const mark = readMark(env, sessionId);
  if (!mark || mark.asks >= MAX_ASKS) return null;
  const answer = answerSince(transcriptPath);
  if (answer === "saved") return null;
  if (answer !== null && tokens < mark.tokens + ANSWERED_GROWTH) return null;
  const asks = mark.asks + 1;
  writeMark(env, sessionId, { asks, tokens });
  return {
    systemMessage: userLine(env, tokens, limit, `Claude is asked again to save a handover (ask ${asks} of ${MAX_ASKS})`),
    hookSpecificOutput: {
      hookEventName: "Stop",
      additionalContext:
        `${ASK_MARK}: reminder ${asks} of ${MAX_ASKS}. This session's context is about ${k(tokens)} tokens (threshold ${k(limit)}) ` +
        (answer === null ? `and you were asked to save a handover but neither saved one nor replied. ` : `and it has grown since you last replied. `) +
        `Now either write a handover with the /clear-resume:handover skill, ${afterSave(env)} ` +
        `or, only if the session's whole goal is done and nothing remains open, reply "${FINISHED_REPLY}" and end your turn; if you must finish something first, reply "${DEFER_REPLY} <reason>".`,
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

// With the relay on, a saved handover is what makes it clear and continue, so a
// finished task must end without one or the relay resumes a done job (same rule
// as headlessAsk).
const RELAY_FINISHED =
  `Save by default. Reply "${FINISHED_REPLY}" and end your turn only if the user's whole goal for this session is done and no next step, open question or follow-up remains, and the relay stops. ` +
  `Finishing the latest request, or reaching a turn end, is not that: if anything is still open, save. `;

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
  const limit = threshold(env, sessionId);
  if (tokens == null || tokens < limit) return null;
  if (!claimNudge(env, sessionId, tokens)) return null;

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
        (relayOn(env) ? RELAY_FINISHED : "") +
        `Do not abandon work in progress to do it. If the turn ends and you neither saved nor replied "${DEFER_REPLY} <reason>", you are asked again at the turn end.`,
    },
  };
}
