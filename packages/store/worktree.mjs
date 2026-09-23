// Every checkout of one repo, so the view can treat them as the same place.
//
// A handover records the directory it was written in. In a repo driven through git
// worktrees that is a different path per branch, so an exact match files most of a
// project's own handovers under "Other repos" while each row still shows the repo's
// name. One `git worktree list` answers it for the whole tree - the alternative,
// resolving each record's path separately, is a process spawn per record.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { normalisePath } from "./schema.mjs";

const TIMEOUT_MS = 3000;

// Git prints the LONG form of a Windows path: a folder reached through an 8.3 name
// ("LONGNA~1") comes back spelled out ("Long Name"). Two spellings of one folder
// compare unequal, so both sides go through realpath before they meet.
function resolveReal(path) {
  if (!path) return "";
  try {
    return normalisePath(realpathSync.native(path));
  } catch {
    // Gone, or a permission wall. The literal spelling is the best answer left.
    return normalisePath(path);
  }
}


// A tree view refreshes on every store write, and the answer only changes when a
// worktree is added or removed. Resolved once per path for the life of the process.
const cache = new Map();

/**
 * Absolute paths of every worktree of the repo at `dir`, including `dir` itself.
 *
 * Fails soft to just `dir`: not a repo, no git on PATH, a folder that has gone
 * away. Grouping is cosmetic, and a view that throws is worse than one that
 * groups conservatively.
 */
// One git call answers both questions, so they share a cache entry:
// { paths, main }. `paths` is the membership set; `main` is the main checkout.
function resolve(dir) {
  // Keyed on what the caller passed, not on what it resolves to: resolution can
  // start failing (the folder is renamed, a drive goes away) and a key that moves
  // underneath a live cache is a miss that looks like a cold start.
  const key = normalisePath(dir || "");
  if (!key) return { paths: [], main: "" };
  if (cache.has(key)) return cache.get(key);

  const here = resolveReal(dir);
  let entry = { paths: [here], main: here };
  try {
    const out = execFileSync("git", ["-C", here, "worktree", "list", "--porcelain"], {
      timeout: TIMEOUT_MS,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const found = out
      .split(/\r?\n/)
      .filter((line) => line.startsWith("worktree "))
      .map((line) => resolveReal(line.slice("worktree ".length)));
    // git prints the main checkout first, and that is the only ordering the
    // porcelain format guarantees.
    if (found.length) entry = { paths: [...new Set([here, ...found])], main: found[0] };
  } catch {
    // Not a repo, or git is unhappy. `here` alone is the honest answer.
  }

  cache.set(key, entry);
  return entry;
}

export function worktreePaths(dir) {
  return resolve(dir).paths;
}

/**
 * The main checkout of the repo at `dir` - the one whose `.git` is a directory
 * rather than a file. `git worktree list` always prints it first, which is the
 * only ordering guarantee the porcelain format makes.
 *
 * Handovers are filed against this rather than the worktree they were written
 * in, so one that was written in a worktree is still found after that worktree
 * is removed - and `wt-finish` removes them routinely.
 *
 * Fails soft to `dir` itself, like worktreePaths.
 */
export function mainWorktree(dir) {
  return resolve(dir).main;
}

/** Drop the memo. Called when the worktree list could have changed under us. */
export function forgetWorktrees() {
  cache.clear();
}
