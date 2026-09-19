// SessionStart logic: decide what to inject for this repo's waiting handovers.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { archive, listWaiting, repoInfo, repoKey, storeRoot } from "./store.mjs";
import { age, chooseHandover } from "./select.mjs";
import { consumedIds, handoverId, markConsumed, removeWorktreeCopy, REPO_FILE, repoHandovers, webEnabled } from "./web.mjs";

const LOAD_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "load.mjs");

function describe(h, now) {
  const branch = h.meta.branch ? ` [${h.meta.branch}]` : "";
  const where = h.file ?? (h.ref ? `git show ${h.ref}:${REPO_FILE}` : REPO_FILE);
  return `- "${h.meta.title ?? h.file}"${branch}, saved ${age(h.meta.created, now)}: ${where}`;
}

// After auto-compaction the summary is lossy about exact state, so the new
// context is told to re-check it before acting on anything it "remembers".
const COMPACT_NOTE =
  "clear-resume: this context was just compacted. The summary is lossy about exact state: " +
  "re-check git status, the current branch and any file before editing it or acting on a remembered result.";

export function run(input, { env = process.env, now = new Date() } = {}) {
  const cwd = input.cwd || process.cwd();
  const { top, branch } = repoInfo(cwd);
  const root = storeRoot(env);
  const key = repoKey(top);
  const stored = listWaiting(root, key);
  // Copies carried in git (web fallback) join the list unless already loaded once.
  const known = new Set([...consumedIds(root, key), ...stored.map((h) => handoverId(h.meta))]);
  const carried = repoHandovers(top, { scanRemotes: webEnabled(env) }).filter((h) => !known.has(handoverId(h.meta)));
  const waiting = [...stored, ...carried].sort((a, b) => String(a.meta.created).localeCompare(String(b.meta.created)));
  const compact = input.source === "compact";
  if (!waiting.length && !compact) return null;

  const maxAgeDays = Number(env.CLEAR_RESUME_MAX_AGE_DAYS) || 7;
  const { load, list } = chooseHandover(waiting, branch, { now, maxAgeDays });
  const parts = compact ? [COMPACT_NOTE] : [];
  let shown;

  if (load) {
    if (load.path) archive(root, key, load.path);
    markConsumed(root, key, load.meta);
    if (repoHandovers(top).some((h) => handoverId(h.meta) === handoverId(load.meta))) removeWorktreeCopy(top);
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
