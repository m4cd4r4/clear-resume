// Web fallback (opt-in, CLEAR_RESUME_WEB=1): a cloud session's home folder is not
// proven to survive between sessions, so the handover also travels in git.
// Save writes it to REPO_FILE, commits only that file and pushes the branch.
// The next session finds it in its working tree, or on another pushed branch
// (a cloud session usually starts on a new branch), loads it once, and records
// its id so a copy left on another branch never loads twice.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseHandover } from "./store.mjs";

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

// Write the saved handover into the repo, commit only that file, push the branch.
export function commitHandover(top, savedPath) {
  const dest = join(top, REPO_FILE);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(savedPath, "utf8"), "utf8");
  const result = { path: dest, committed: false, pushed: false, error: null };
  try {
    git(top, ["add", "--", REPO_FILE]);
    git(top, ["commit", "-q", "-m", "chore: clear-resume handover", "--", REPO_FILE], { quiet: false });
    result.committed = true;
    git(top, ["push", "-q", "-u", "origin", "HEAD"], { quiet: false });
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
    execFileSync("git", ["fetch", "--quiet", "--no-tags", "origin"], { cwd: top, stdio: "ignore", timeout: 5000 });
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
