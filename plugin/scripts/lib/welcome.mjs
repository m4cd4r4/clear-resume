// The relay clears a user's chat by itself from the first install, so the first
// session says so once. Claude is asked to repeat the line because the VS Code panel
// may not draw a systemMessage (see the note in hook.mjs): a request, not a guarantee.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { autoEnabled, headless, RELAY_OPTION, relayOn } from "./auto-flag.mjs";
import { storeRoot } from "./store.mjs";

const MARK = ".welcomed";
const DEFAULT_CLEARS = 3;

function limit(env) {
  const set = String(env[RELAY_OPTION] ?? "").trim().toLowerCase();
  if (set === "unlimited") return "with no limit on clears";
  const n = set ? Number(set) : DEFAULT_CLEARS;
  return `up to ${n} ${n === 1 ? "clear" : "clears"} per window`;
}

export function welcomeLine(env = process.env) {
  if (headless(env) || !autoEnabled(env) || !relayOn(env)) return null;
  return `Cornerman is on. When this chat gets long, it saves a handover, clears the chat and carries on, ${limit(env)}. Type /relay off to stop it in this window.`;
}

// Adds the notice to the SessionStart output, or makes one when the hook had nothing
// to say. The mark is written only once the output is out, as with a worktree copy.
export function withWelcome(out, { env = process.env } = {}) {
  const line = welcomeLine(env);
  if (!line) return out;
  const root = storeRoot(env);
  const mark = join(root, MARK);
  if (existsSync(mark)) return out;
  const ask = `cornerman: this is the first session with the relay on. Tell the user this one line in your first reply: ${line}`;
  const context = out?.hookSpecificOutput?.additionalContext;
  const merged = {
    ...out,
    systemMessage: out?.systemMessage ? `${out.systemMessage}\n${line}` : line,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context ? `${context}\n\n---\n\n${ask}` : ask },
  };
  Object.defineProperty(merged, "afterOutput", {
    value: () => {
      out?.afterOutput?.();
      mkdirSync(root, { recursive: true });
      writeFileSync(mark, "");
    },
  });
  return merged;
}
