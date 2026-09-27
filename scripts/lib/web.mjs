// Web fallback (opt-in, CLEAR_RESUME_WEB=1): a cloud session's home folder does not
// survive between sessions, so the handover also travels in git. Save pushes it
// to its own ref (clear-resume/<branch>). The next session fetches and lists what it
// finds there with the command that reads it, but never loads it on its own: anything
// carried in git may have been written by someone else. The SessionStart hook never
// writes to the repo or its remote; the only git write it makes is that fetch.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { handoverMarkdown, parseHandover } from "./store.mjs";

export const REPO_FILE = ".clear-resume/HANDOVER.md";
const MAX_REFS = 50;

export function webEnabled(env = process.env) {
  return /^(1|true|on|yes)$/i.test(String(env.CLEAR_RESUME_WEB ?? "").trim());
}

function git(cwd, args, { quiet = true } = {}) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", quiet ? "ignore" : "pipe"], timeout: 8000 }).trim();
}

function tryGit(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

// One id per handover, shared by every copy of it (store, working tree, branches).
export const handoverId = (meta) => `${meta.created ?? ""}|${meta.title ?? ""}`;

// Each branch's handover travels on its own ref, never on the user's branch: a new
// cloud session starts from a cached clone that is behind the last push, so a
// commit on the user's branch would fail to push (seen live 2026-09-19).
export const REF_PREFIX = "clear-resume/";
export const handoverRef = (branch) => REF_PREFIX + (branch || "detached");

function gitIn(cwd, args, input) {
  return execFileSync("git", args, { cwd, input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 8000 }).trim();
}

// Push the saved handover as a standalone commit holding only REPO_FILE, to
// refs/heads/clear-resume/<branch>. The working tree, index and branch are untouched.
export function commitHandover(top, savedPath, branch) {
  const ref = handoverRef(branch);
  const result = { ref, pushed: false, error: null };
  try {
    const blob = gitIn(top, ["hash-object", "-w", "--stdin"], handoverMarkdown(savedPath));
    const [dir, name] = REPO_FILE.split("/");
    const inner = gitIn(top, ["mktree"], `100644 blob ${blob}\t${name}\n`);
    const outer = gitIn(top, ["mktree"], `040000 tree ${inner}\t${dir}\n`);
    const commit = gitIn(top, ["commit-tree", outer, "-m", "chore: clear-resume handover"]);
    gitIn(top, ["push", "-q", "--force", "origin", `${commit}:refs/heads/${ref}`]);
    result.pushed = true;
  } catch (err) {
    result.error = String(err.stderr || err.message).trim().split("\n").at(-1);
  }
  return result;
}

function consumedFile(root, key) {
  return join(root, key, "consumed.txt");
}

export function consumedIds(root, key) {
  const f = consumedFile(root, key);
  return new Set(existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean) : []);
}

export function markConsumed(root, key, meta) {
  mkdirSync(join(root, key), { recursive: true });
  appendFileSync(consumedFile(root, key), handoverId(meta) + "\n", "utf8");
}

/**
 * The handover this repo consumed in the last `withinMs`, or null.
 *
 * One /clear in the VS Code extension fires SessionStart twice - once as
 * `startup`, once as `clear`. The first invocation loads a handover and marks it
 * consumed; the second sees it gone from the waiting list and reports "none
 * loaded", which is the opposite of what happened, and the loaded body is the one
 * that never reaches Claude. The consume itself is already idempotent - only the
 * reporting was not.
 *
 * The log is append-only and written ONLY on a load, so its last line names the
 * handover just loaded and its mtime is when that happened. Nothing else writes
 * it, so a handover archived by hand in the extension is never mistaken for one.
 */
export function lastConsumed(root, key, { now = new Date(), withinMs = 60_000 } = {}) {
  const f = consumedFile(root, key);
  if (!existsSync(f)) return null;
  try {
    const at = statSync(f).mtime;
    if (Math.abs(now - at) > withinMs) return null;
    const id = readFileSync(f, "utf8").split("\n").filter(Boolean).at(-1);
    return id ? { id, at } : null;
  } catch {
    return null;
  }
}

// Remote-tracking branches, newest commit first, without the symbolic origin/HEAD
// (whose short name is just "origin"). Capped so a huge repo stays fast.
export function remoteBranches(top) {
  return (tryGit(top, ["for-each-ref", "--sort=-committerdate", "--format=%(refname)", "refs/remotes"]) ?? "")
    .split("\n")
    .filter((r) => r && !r.endsWith("/HEAD"))
    .map((r) => r.replace(/^refs\/remotes\//, ""))
    .slice(0, MAX_REFS);
}

// A cloud session can start from a cached clone whose remote-tracking refs predate
// the last session's push (seen live 2026-09-19: ref 2 commits behind ls-remote).
// One bounded fetch refreshes them; offline or slow, the hook carries on unfetched.
export function refreshRemotes(top) {
  try {
    // No auto gc or maintenance: a session start is not the time to repack a repo.
    execFileSync("git", ["-c", "gc.auto=0", "-c", "maintenance.auto=false", "fetch", "--quiet", "--prune", "--no-tags", "origin"], { cwd: top, stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

const SAFE_REF = /^[A-Za-z0-9._\/-]+$/;

const REPO_DIR = REPO_FILE.split("/")[0];

// A folder path that is safe inside double quotes in bash, PowerShell and cmd: no
// $, backtick, quote, %, ! or ^, which one of those shells would act on. A repo can
// be cloned into a folder named `$(anything)`, and the user runs the listed line.
const SAFE_TOP = /^[\p{L}\p{M}\p{N} ._\/\\:~+,@()=-]+$/u;
const gitAt = (top) => (SAFE_TOP.test(top) ? `git -C "${top}"` : "git");

/**
 * What the index holds at or under .clear-resume, ignoring letter case (on a
 * case-insensitive disk a committed `.Clear-Resume/handover.md` is REPO_FILE).
 * `null` when git cannot say, which callers read as tracked. Otherwise `any` says
 * whether there is an entry at all (a file, a symlink, a submodule), and `file` is
 * the index spelling of a regular file that is REPO_FILE up to letter case, or null.
 *
 * `file` is the only path from git that is ever printed in a command, and only
 * because it is REPO_FILE up to case: a committed `.clear-resume/HANDOVER.md/$(x)`
 * is an entry too, and printed it would run `x` (security review, 2026-09-27).
 */
function indexEntries(top) {
  const out = tryGit(top, ["ls-files", "-s", "-z", "--", `:(icase)${REPO_DIR}`]);
  if (out === null) return null;
  const entries = out
    .split("\0")
    .filter(Boolean)
    .map((line) => ({ mode: line.split(" ")[0], path: line.slice(line.indexOf("\t") + 1) }));
  const file = entries.find((e) => (e.mode === "100644" || e.mode === "100755") && e.path.toLowerCase() === REPO_FILE.toLowerCase());
  return { any: entries.length > 0, file: file?.path ?? null };
}

/**
 * The working-tree copy's path when it is positively the user's own untracked
 * file, else null. An empty `ls-files` is not proof: git also says nothing for a
 * path inside a submodule or behind a symlinked folder, and both let a cloned repo
 * put a file there that was loaded and then deleted (security review, 2026-09-27).
 * So every one of these must hold, and anything unexpected fails closed:
 *   - .clear-resume is a real folder and HANDOVER.md a regular file, neither a link;
 *   - the file's real path is REPO_FILE under the repo's real path;
 *   - the index has nothing at or under .clear-resume;
 *   - git lists exactly REPO_FILE as untracked there;
 *   - .clear-resume belongs to this repo, not to a nested one.
 */
function untrackedCopy(top) {
  try {
    const dir = join(top, REPO_DIR);
    const local = join(top, REPO_FILE);
    const d = lstatSync(dir);
    const f = lstatSync(local);
    if (!d.isDirectory() || d.isSymbolicLink() || !f.isFile() || f.isSymbolicLink()) return null;
    if (realpathSync.native(local) !== join(realpathSync.native(top), REPO_FILE)) return null;
    const index = indexEntries(top);
    if (!index || index.any) return null;
    const others = tryGit(top, ["ls-files", "--others", "-z", "--", REPO_FILE]);
    if (others === null || others.split("\0").filter(Boolean).join("\n") !== REPO_FILE) return null;
    const outer = tryGit(top, ["rev-parse", "--show-toplevel"]);
    if (!outer || tryGit(dir, ["rev-parse", "--show-toplevel"]) !== outer) return null;
    return local;
  } catch {
    return null;
  }
}

/**
 * Handovers carried in git, in web mode only; outside it this returns nothing and
 * reads nothing.
 *
 *   source "worktree"  - an UNTRACKED working-tree copy. Only this one may be loaded.
 *   source "committed" - a copy in the index. Read from the index, never from the
 *                        working tree, and only ever listed: a repo cloned from
 *                        anyone can carry one (2026-09-27).
 *   source "remote"    - a copy on a remote-tracking branch, after one fetch. Listed.
 *
 * Each listed one carries `show`, the command that prints it when the user asks.
 */
export function repoHandovers(top, { web = false } = {}) {
  if (!web) return [];
  const found = [];
  // An unsafe folder name is left out of every command, which then has to be run
  // from the repo's top folder; `fromTop` has the listing say so.
  const fromTop = !SAFE_TOP.test(top);
  if (existsSync(join(top, REPO_DIR))) {
    const local = untrackedCopy(top);
    const index = local ? null : indexEntries(top);
    if (local) {
      found.push({ source: "worktree", ref: null, show: null, path: local, ...parseHandover(readFileSync(local, "utf8")) });
    } else if (index?.file) {
      const text = tryGit(top, ["show", `:${index.file}`]);
      if (text) found.push({ source: "committed", ref: null, show: `${gitAt(top)} show :${index.file}`, fromTop, ...parseHandover(text) });
    }
  }

  // Only the refs save pushes to, and only names that are safe to print inside a
  // command: a remote can name a branch `$(anything)`, and the user runs this line.
  refreshRemotes(top);
  for (const ref of remoteBranches(top).filter((r) => r.split("/")[1] === REF_PREFIX.slice(0, -1) && SAFE_REF.test(r))) {
    const text = tryGit(top, ["show", `${ref}:${REPO_FILE}`]);
    if (text) found.push({ source: "remote", ref, show: `${gitAt(top)} show "${ref}:${REPO_FILE}"`, fromTop, ...parseHandover(text) });
  }

  const seen = new Set();
  return found.filter((h) => h.meta.created && !seen.has(handoverId(h.meta)) && seen.add(handoverId(h.meta)));
}

/**
 * Delete the working-tree copy once its load has been written out, and only if it
 * is still the same handover and still positively untracked (untrackedCopy). A tracked copy is left alone:
 * removing it would change the user's repo. Never touches the index or a branch.
 */
export function removeUntrackedCopy(top, id) {
  try {
    const local = untrackedCopy(top);
    if (!local) return false;
    if (handoverId(parseHandover(readFileSync(local, "utf8")).meta) !== id) return false;
    unlinkSync(local);
    return true;
  } catch {
    return false;
  }
}
