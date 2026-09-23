// SessionStart logic: decide what to inject for this repo's waiting handovers.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { archive, listWaiting, repoInfo, repoKey, storeRoot } from "./store.mjs";
import { isSynced, pull } from "../../packages/store/sync.mjs";
import { prune } from "../../packages/store/store.mjs";
import { age, chooseHandover } from "./select.mjs";
import { consumedIds, retireHandoverRef, handoverId, markConsumed, removeWorktreeCopy, REPO_FILE, repoHandovers, webEnabled } from "./web.mjs";

const LOAD_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "load.mjs");

// One list row, over two lines: what it is, then the exact command that resumes it.
// The reader chooses on the first line, so the title and branch lead and the record
// filename never appears there - it is 48 characters of machine name, pid and
// timestamp, which is unreadable and needlessly names the machine.
function describe(h, now) {
  const branch = h.meta.branch ? `, branch ${h.meta.branch}` : "";
  const how = h.file
    ? `node "${LOAD_SCRIPT}" ${h.file}`
    : h.ref
      ? `git show ${h.ref}:${REPO_FILE}`
      : `read ${REPO_FILE}`;
  return `- "${h.meta.title ?? h.file}"${branch}, saved ${age(h.meta.created, now)}\n    ${how}`;
}

// The user sees systemMessage and nothing else, so a list they are asked to choose
// from has to carry the titles. Three is enough to choose by; past that a count
// reads better than a wall of them.
function titleList(list) {
  const shown = list.slice(0, 3).map((h) => `"${h.meta.title ?? h.file}"`);
  const rest = list.length - shown.length;
  return shown.join(", ") + (rest > 0 ? `, and ${rest} more` : "");
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// After auto-compaction the summary is lossy about exact state, so the new
// context is told to re-check it before acting on anything it "remembers".
const COMPACT_NOTE =
  "clear-resume: this context was just compacted. The summary is lossy about exact state: " +
  "re-check git status, the current branch and any file before editing it or acting on a remembered result.";

// A session start blocks on the pull, so it gives up quickly. Being a second late
// with the other machine's handover is a nuisance; a session that hangs on a dead
// VPN is a broken tool. Set CLEAR_RESUME_SYNC=off to skip it entirely.
const SYNC_TIMEOUT_MS = 8000;

function pullFirst(root, env) {
  if (String(env.CLEAR_RESUME_SYNC || "").toLowerCase() === "off") return;
  if (!isSynced(root)) return;
  const timeout = Number(env.CLEAR_RESUME_SYNC_TIMEOUT_MS) || SYNC_TIMEOUT_MS;
  try {
    pull(root, { timeout });
  } catch {
    // pull() already fails soft; this is the belt to its braces. A session must
    // start whatever the network is doing.
  }
}

/**
 * Tidy the store on the way in.
 *
 * The extension prunes when its tree view opens, which is no use on a machine
 * driven only from the CLI: there the store grows without limit and tombstones
 * pulled from the other machine are never purged. Nothing here is pushed - both
 * machines run the same clock over the same records and land in the same place.
 */
function pruneQuietly(root, now) {
  try {
    prune({ root, now });
  } catch {
    // A session must start whatever state the store is in.
  }
}

export function run(input, { env = process.env, now = new Date() } = {}) {
  const cwd = input.cwd || process.cwd();
  const { top, branch } = repoInfo(cwd);
  const root = storeRoot(env);
  // Take the other machine's handovers before deciding what to offer.
  pullFirst(root, env);
  pruneQuietly(root, now);
  const key = repoKey(top);
  const stored = listWaiting(root, key);
  // Copies carried in git (web fallback) join the list unless already loaded once.
  const known = new Set([...consumedIds(root, key), ...stored.map((h) => handoverId(h.meta))]);
  const inGit = repoHandovers(top, { scanRemotes: webEnabled(env) });
  const carried = inGit.filter((h) => !known.has(handoverId(h.meta)));
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
    for (const h of inGit) if (handoverId(h.meta) === handoverId(load.meta)) retireHandoverRef(top, h.ref);
    // A branch mismatch is the one thing about a loaded handover the user should
    // notice, so it goes in both strings rather than only in Claude's copy.
    const from = load.meta.branch && load.meta.branch !== branch ? `, written on branch ${load.meta.branch}` : "";
    parts.push(
      `clear-resume: this session continues earlier work. Handover "${load.meta.title}", saved ${age(load.meta.created, now)}${from}. ` +
        `Its branch, file and status claims are a snapshot: check them before acting.\n\n${load.body.trim()}`,
    );
    shown = `clear-resume: loaded handover "${load.meta.title}" (saved ${age(load.meta.created, now)}${from}).`;
  }

  if (list.length) {
    // "other" only when something else was loaded for them to be other than.
    const lead = load
      ? `clear-resume: ${plural(list.length, "other handover")} also waiting for this repo, not loaded:`
      : `clear-resume: ${plural(list.length, "handover")} waiting for this repo, none loaded. Give the user the titles and ask which one:`;
    parts.push(`${lead}\n${list.map((h) => describe(h, now)).join("\n")}`);
    // With a handover already loaded the user still needs telling that others
    // exist, or they cannot ask for one. This only appears when there are some.
    shown = load
      ? `${shown} ${plural(list.length, "other handover")} waiting; say if you want one of those instead.`
      : `clear-resume: ${plural(list.length, "handover")} waiting for this repo: ${titleList(list)}. Say which to resume.`;
  }

  return {
    systemMessage: shown,
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: parts.join("\n\n---\n\n") },
  };
}
