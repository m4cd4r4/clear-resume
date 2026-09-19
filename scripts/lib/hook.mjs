// SessionStart logic: decide what to inject for this repo's waiting handovers.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { archive, listWaiting, repoInfo, repoKey, storeRoot } from "./store.mjs";
import { age, chooseHandover } from "./select.mjs";

const LOAD_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "load.mjs");

function describe(h, now) {
  const branch = h.meta.branch ? ` [${h.meta.branch}]` : "";
  return `- "${h.meta.title ?? h.file}"${branch}, saved ${age(h.meta.created, now)}: ${h.file}`;
}

export function run(input, { env = process.env, now = new Date() } = {}) {
  const cwd = input.cwd || process.cwd();
  const { top, branch } = repoInfo(cwd);
  const root = storeRoot(env);
  const key = repoKey(top);
  const waiting = listWaiting(root, key);
  if (!waiting.length) return null;

  const maxAgeDays = Number(env.CLEAR_RESUME_MAX_AGE_DAYS) || 7;
  const { load, list } = chooseHandover(waiting, branch, { now, maxAgeDays });
  const parts = [];
  let shown;

  if (load) {
    archive(root, key, load.path);
    const from = load.meta.branch && load.meta.branch !== branch ? ` (written on branch ${load.meta.branch})` : "";
    parts.push(
      `clear-resume: this session continues earlier work. Handover "${load.meta.title}", saved ${age(load.meta.created, now)}${from}. ` +
        `Treat its branch, file and status claims as a snapshot: check them before acting.\n\n${load.body.trim()}`,
    );
    shown = `clear-resume: loaded handover "${load.meta.title}" (saved ${age(load.meta.created, now)}).`;
  }

  if (list.length) {
    parts.push(
      `clear-resume: ${list.length} other handover(s) waiting for this repo, not loaded:\n` +
        list.map((h) => describe(h, now)).join("\n") +
        `\nIf the user asks to resume one, run: node "${LOAD_SCRIPT}" <file>`,
    );
    shown ??= `clear-resume: ${list.length} handover(s) waiting for this repo. Say which to resume.`;
  }

  return {
    systemMessage: shown,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: parts.join("\n\n---\n\n") },
  };
}
