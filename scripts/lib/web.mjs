// Web fallback (opt-in, CLEAR_RESUME_WEB=1): a cloud session's home folder does not
// survive between sessions, so the handover also travels in git. Save pushes it
// to its own ref (clear-resume/<branch>). The next session fetches, finds it on
// any remote branch, loads it once and empties the ref.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
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

// Once loaded, empty the handover ref so the next session, whose home folder is
// gone, does not load it again. It is overwritten with an empty commit, not
// deleted: a cloud session's credentials get HTTP 403 on a ref delete but may
// force-push (seen live 2026-09-19). Failure only means it may load again.
export function retireHandoverRef(top, remoteRef) {
  if (!remoteRef?.startsWith("origin/" + REF_PREFIX)) return false;
  try {
    const empty = gitIn(top, ["mktree"], "");
    const commit = gitIn(top, ["commit-tree", empty, "-m", "chore: clear-resume handover loaded"]);
    execFileSync("git", ["push", "-q", "--force", "origin", `${commit}:refs/heads/${remoteRef.slice("origin/".length)}`], { cwd: top, stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
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
    execFileSync("git", ["fetch", "--quiet", "--prune", "--no-tags", "origin"], { cwd: top, stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// Handovers carried in git: the working tree copy, plus (in web mode) the copy on
// each remote-tracking branch, after one refresh of those branches.
export function repoHandovers(top, { scanRemotes = false } = {}) {
  const found = [];
  const local = join(top, REPO_FILE);
  if (existsSync(local)) found.push({ source: "worktree", ref: null, ...parseHandover(readFileSync(local, "utf8")) });

  if (scanRemotes) {
    refreshRemotes(top);
    for (const ref of remoteBranches(top)) {
      const text = tryGit(top, ["show", `${ref}:${REPO_FILE}`]);
      if (text) found.push({ source: "remote", ref, ...parseHandover(text) });
    }
  }

  const seen = new Set();
  return found.filter((h) => h.meta.created && !seen.has(handoverId(h.meta)) && seen.add(handoverId(h.meta)));
}

// Remove the working-tree copy once loaded. A committed copy is deleted in its own
// commit (not pushed: it rides along with the next push); an uncommitted one is unlinked.
export function removeWorktreeCopy(top) {
  const local = join(top, REPO_FILE);
  if (!existsSync(local)) return;
  if (tryGit(top, ["ls-files", "--error-unmatch", REPO_FILE]) !== null) {
    tryGit(top, ["rm", "-q", "--", REPO_FILE]);
    tryGit(top, ["commit", "-q", "-m", "chore: clear-resume handover loaded", "--", REPO_FILE]);
  }
  if (existsSync(local)) unlinkSync(local);
}
