// Git transport for the handover store.
//
// The store is a directory of small JSON files whose names carry the machine that
// wrote them, so two machines can never create the same path: a create conflict is
// structurally impossible. What git gives us on top is history, recovery, and a
// delete that can travel - which is the whole reason `remove()` writes a tombstone
// instead of unlinking.
//
// Everything here fails soft. A SessionStart hook runs this, so being offline, on a
// flaky VPN, or mid-rebase must return a reason, never throw and never block.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { handoversDir, storeRoot } from "./store.mjs";

const TIMEOUT_MS = 30000;

// LF everywhere. Without this the store churns whole-file diffs the first time a
// Windows machine and a Unix one both write to it.
const GITATTRIBUTES = "* text=auto eol=lf\n";

// One marker file per session id, written so auto mode nudges once. Machine-local
// and ephemeral: syncing it would add a commit per session and tell the other
// machine nothing. The consumed.txt marks under each repo key are NOT here - a
// handover loaded on one machine must not be offered again on the other.
const GITIGNORE = ".nudged/\n";

function git(cwd, args, { timeout = TIMEOUT_MS } = {}) {
  return execFileSync("git", args, {
    cwd,
    timeout,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Run a git command and report failure instead of raising it. */
function tryGit(cwd, args, opts) {
  try {
    return { ok: true, out: git(cwd, args, opts) };
  } catch (error) {
    return { ok: false, out: "", reason: reasonFrom(error, args) };
  }
}

function reasonFrom(error, args) {
  const text = String(error?.stderr || error?.message || "").trim().split("\n").slice(-3).join(" ");
  return `git ${args[0]}: ${text || "failed"}`;
}

export function isSynced(root = storeRoot()) {
  return existsSync(join(root, ".git"));
}

/** A store repo needs an identity to commit with, and may not inherit one. */
function ensureIdentity(root) {
  if (!tryGit(root, ["config", "user.email"]).out) {
    tryGit(root, ["config", "user.email", "clear-resume@localhost"]);
    tryGit(root, ["config", "user.name", "clear-resume"]);
  }
}

/**
 * Make the store root a git repo pointed at `remote`, and get the two in step.
 *
 * Idempotent, and symmetric: the first machine pushes what it has, and a second
 * machine with its own records joins them to what is already on the remote rather
 * than replacing it.
 */
export function initSync(root = storeRoot(), remote, { now = new Date() } = {}) {
  if (!remote) return { ok: false, reason: "no remote given" };

  // A machine can be set up before it has written anything, so the root and the
  // handovers folder may not exist yet.
  mkdirSync(handoversDir(root), { recursive: true });

  if (!isSynced(root)) {
    const init = tryGit(root, ["init", "-b", "main"], { timeout: TIMEOUT_MS });
    if (!init.ok) return init;
  }
  ensureIdentity(root);

  const attributes = join(root, ".gitattributes");
  if (!existsSync(attributes)) writeFileSync(attributes, GITATTRIBUTES, "utf8");

  const ignore = join(root, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, GITIGNORE, "utf8");

  const current = tryGit(root, ["remote", "get-url", "origin"]).out;
  if (!current) tryGit(root, ["remote", "add", "origin", remote]);
  else if (current !== remote) tryGit(root, ["remote", "set-url", "origin", remote]);

  commitLocal(root, { now });

  // Symmetric on purpose. The first machine has nothing to pull; a second machine
  // with its own records joins them to what is already there rather than either
  // side replacing the other.
  const pulled = pull(root);
  if (!pulled.ok) return pulled;

  const pushed = tryGit(root, ["push", "-u", "origin", "main"]);
  if (!pushed.ok) return { ok: false, reason: pushed.reason };
  return { ok: true, resolved: pulled.resolved };
}

/**
 * Commit whatever the store has written since the last sync.
 *
 * One commit per sync, not one per handover: the interesting unit is "what this
 * machine did between syncs", and a per-file commit would mean a hook doing
 * dozens of writes on a migration.
 */
export function commitLocal(root = storeRoot(), { now = new Date() } = {}) {
  if (!isSynced(root)) return { ok: false, committed: false, reason: "not synced" };
  ensureIdentity(root);

  const add = tryGit(root, ["add", "-A"]);
  if (!add.ok) return { ok: false, committed: false, reason: add.reason };

  // `diff --cached --quiet` exits 0 when nothing is staged, non-zero when there is.
  if (tryGit(root, ["diff", "--cached", "--quiet"]).ok) return { ok: true, committed: false };

  const message = `store: ${new Date(now).toISOString()}`;
  const commit = tryGit(root, ["commit", "-m", message]);
  if (!commit.ok) return { ok: false, committed: false, reason: commit.reason };
  return { ok: true, committed: true };
}

/**
 * Fetch and merge the remote into the local store.
 *
 * `--allow-unrelated-histories` because two machines that each started their own
 * store have no common root, and joining them is the normal second-machine path,
 * not an accident.
 */
export function pull(root = storeRoot(), { timeout = TIMEOUT_MS } = {}) {
  if (!isSynced(root)) return { ok: false, resolved: [], reason: "not synced" };
  ensureIdentity(root);

  // No refspec: a brand new remote has no `main` to ask for, and naming it there
  // turns "this machine is the first one" into a fetch error.
  const fetched = tryGit(root, ["fetch", "origin"], { timeout });
  if (!fetched.ok) return { ok: false, resolved: [], reason: fetched.reason };

  // Nothing on the remote yet: this machine is the first one.
  if (!tryGit(root, ["rev-parse", "--verify", "--quiet", "origin/main"]).out) {
    return { ok: true, resolved: [] };
  }

  const merged = tryGit(root, ["merge", "origin/main", "--no-edit", "--allow-unrelated-histories"], { timeout });
  if (merged.ok) return { ok: true, resolved: [] };

  const resolved = resolveConflicts(root);
  if (resolved === null) {
    tryGit(root, ["merge", "--abort"]);
    return { ok: false, resolved: [], reason: "merge could not be resolved" };
  }

  const committed = tryGit(root, ["commit", "--no-edit"]);
  if (!committed.ok) return { ok: false, resolved, reason: committed.reason };
  return { ok: true, resolved };
}

/**
 * Settle a conflicted merge, record by record.
 *
 * Filenames carry the machine that wrote them, so two machines can never create
 * the same path. The only conflict possible is both of them rewriting one record -
 * pinning it, archiving it, deleting it - and the later `updatedAt` wins. Losing a
 * pin flag is an acceptable worst case; bodies never change after creation, so they
 * are not in the conflict path at all.
 *
 * Returns the ids it settled, or null if it hit something it cannot judge.
 */
export function resolveConflicts(root = storeRoot()) {
  const listed = tryGit(root, ["diff", "--name-only", "--diff-filter=U"]);
  if (!listed.ok) return null;

  const resolved = [];
  for (const path of listed.out.split("\n").map((p) => p.trim()).filter(Boolean)) {
    const ours = stage(root, 2, path);
    const theirs = stage(root, 3, path);
    const winner = pick(ours, theirs);

    if (winner === null) {
      // Both sides unlinked it, or neither version parses. Let it stay gone.
      if (!tryGit(root, ["rm", "-f", "--ignore-unmatch", path]).ok) return null;
    } else {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), winner.text, "utf8");
      if (!tryGit(root, ["add", "--", path]).ok) return null;
    }
    resolved.push(path.replace(/^handovers\//, "").replace(/\.json$/, ""));
  }
  return resolved;
}

/** One side of a conflict, straight out of the index. */
function stage(root, n, path) {
  const shown = tryGit(root, ["show", `:${n}:${path}`]);
  if (!shown.ok) return null;
  const text = `${shown.out}\n`;
  try {
    return { text, updatedAt: String(JSON.parse(shown.out).updatedAt || "") };
  } catch {
    return { text, updatedAt: "" };
  }
}

/** Later `updatedAt` wins. A side that is absent cannot win; a tie goes to ours. */
function pick(ours, theirs) {
  if (!ours) return theirs;
  if (!theirs) return ours;
  return theirs.updatedAt > ours.updatedAt ? theirs : ours;
}

/**
 * Send this machine's changes and take the other machine's.
 *
 * Fails soft in every direction: offline, a remote that has gone away, a push that
 * loses a race. A SessionStart hook calls this, so it returns a reason rather than
 * throwing, and whatever it committed locally goes out on the next attempt.
 */
export function sync(root = storeRoot(), { now = new Date(), timeout = TIMEOUT_MS } = {}) {
  if (!isSynced(root)) return { ok: false, resolved: [], reason: "not synced" };

  const committed = commitLocal(root, { now });
  if (!committed.ok) return { ok: false, resolved: [], reason: committed.reason };

  const pulled = pull(root, { timeout });
  if (!pulled.ok) return { ok: false, resolved: [], reason: pulled.reason };

  let pushed = tryGit(root, ["push", "origin", "main"], { timeout });
  if (!pushed.ok) {
    // Someone else pushed between our fetch and our push. Take theirs and retry
    // once; a second failure is reported rather than looped on.
    const again = pull(root, { timeout });
    if (!again.ok) return { ok: false, resolved: pulled.resolved, reason: again.reason };
    pulled.resolved.push(...again.resolved);
    pushed = tryGit(root, ["push", "origin", "main"], { timeout });
    if (!pushed.ok) return { ok: false, resolved: pulled.resolved, reason: pushed.reason };
  }

  return { ok: true, resolved: pulled.resolved };
}

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "sync.mjs");

/**
 * Send this machine's changes without waiting for the network.
 *
 * Writing a handover is the end of a piece of work, and it must not sit on a slow
 * push - so the save fires this and returns. The child outlives the session that
 * started it; the returned handle exists so a test can wait for it.
 */
export function pushInBackground(root = storeRoot(), env = process.env) {
  if (String(env.CLEAR_RESUME_SYNC || "").toLowerCase() === "off") return null;
  const child = spawn(process.execPath, [CLI], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, CLEAR_RESUME_HOME: root },
  });
  child.unref();
  return child;
}
