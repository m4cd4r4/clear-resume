// tdd-guard:allow - web-fallback rules, each mutation-checked.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { run } from "../plugin/scripts/lib/hook.mjs";
import { handoverMarkdown, saveHandover } from "../plugin/scripts/lib/store.mjs";
import { commitHandover, remoteBranches, REPO_FILE } from "../plugin/scripts/lib/web.mjs";

const SAVE = join(import.meta.dirname, "../plugin/scripts/save.mjs");
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

beforeAll(() => {
  Object.assign(process.env, { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" });
});

let dir, origin, one, two, rootOne, rootTwo;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cr-web-"));
  origin = join(dir, "origin.git");
  one = join(dir, "one");
  two = join(dir, "two");
  rootOne = join(dir, "home-one");
  rootTwo = join(dir, "home-two");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["clone", "-q", origin, one], { stdio: "ignore" });
  git(one, "checkout", "-q", "-b", "main");
  git(one, "commit", "-q", "--allow-empty", "-m", "init");
  git(one, "push", "-q", "-u", "origin", "main");
  git(one, "checkout", "-q", "-b", "claude/one");
  git(one, "push", "-q", "-u", "origin", "claude/one");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// Session 1 saves in web mode; session 2 is a fresh clone with an empty home folder.
function saveInSessionOne(title = "Web work", body = "## Next action\nFinish the parser.") {
  // --cwd because this process runs inside a Claude session and save.mjs would
  // otherwise file against THAT session's root rather than the temp repo. That
  // is the point of the flag: a caller that genuinely knows better.
  return execFileSync(process.execPath, [SAVE, "--title", title, "--cwd", one], {
    cwd: one,
    input: body,
    env: { ...process.env, CLEAR_RESUME_HOME: rootOne, CLEAR_RESUME_WEB: "1" },
    encoding: "utf8",
  });
}
function freshSessionTwo(branch = "claude/two") {
  execFileSync("git", ["clone", "-q", origin, two], { stdio: "ignore" });
  git(two, "checkout", "-q", "-B", branch, branch === "claude/two" ? "origin/main" : `origin/${branch}`);
}
const webEnv = (root) => ({ CLEAR_RESUME_HOME: root, CLEAR_RESUME_WEB: "1" });
const loaded = (out) => out?.hookSpecificOutput.additionalContext.includes("this session continues earlier work") ?? false;
// Everything the hook could change: the user's HEAD, branches, index and files,
// and every ref on the remote. Only remote-tracking refs may move (the fetch).
const repoState = (cwd) => [
  git(cwd, "rev-parse", "HEAD"),
  git(cwd, "for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"),
  git(cwd, "status", "--porcelain", "--untracked-files=all"),
  git(cwd, "ls-remote", "origin"),
];

describe("save in web mode", () => {
  it("pushes to its own ref, leaving the user's branch, index and files alone", () => {
    writeFileSync(join(one, "staged.txt"), "mine");
    git(one, "add", "staged.txt");
    writeFileSync(join(one, "untracked.txt"), "mine");
    const head = git(one, "rev-parse", "HEAD");
    const out = saveInSessionOne();
    expect(out).toMatch(/Pushed to clear-resume\/claude\/one/);
    expect(git(one, "rev-parse", "HEAD")).toBe(head);
    expect(git(one, "status", "--porcelain")).toBe("A  staged.txt\n?? untracked.txt");
    expect(git(one, "ls-remote", "origin", "claude/one").split("\t")[0]).toBe(head);
    git(one, "fetch", "-q", "origin", "clear-resume/claude/one");
    expect(git(one, "ls-tree", "-r", "--name-only", "FETCH_HEAD")).toBe(REPO_FILE);
  });

  it("still pushes when this clone is behind the remote branch", () => {
    freshSessionTwo("claude/one");
    git(one, "commit", "-q", "--allow-empty", "-m", "moved on");
    git(one, "push", "-q", "origin", "claude/one");
    const { path } = saveHandover({ cwd: two, title: "stale", body: "z", root: rootTwo });
    const r = commitHandover(two, path, "claude/one");
    expect(r.error).toBeNull();
    expect(r.pushed).toBe(true);
  });

  it("lists remote branches without the symbolic origin/HEAD", () => {
    saveInSessionOne();
    freshSessionTwo();
    const refs = remoteBranches(two);
    expect(refs).toContain("origin/claude/one");
    expect(refs).toContain("origin/main");
    expect(git(two, "symbolic-ref", "refs/remotes/origin/HEAD")).toBe("refs/remotes/origin/main");
    expect(refs.filter((r) => r === "origin" || r.endsWith("/HEAD"))).toEqual([]);
  });

  it("reports a failed push instead of claiming success", () => {
    git(one, "remote", "remove", "origin");
    const { path } = saveHandover({ cwd: one, title: "x", body: "y", root: rootOne });
    const r = commitHandover(one, path, "claude/one");
    expect(r.pushed).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

// A handover on a remote ref is listed with the command that prints it, never
// loaded: anyone who can push to the remote could have written it (2026-09-27).
describe("load in a new cloud session", () => {
  it("lists the handover on another pushed branch's ref, without loading it", () => {
    saveInSessionOne();
    freshSessionTwo();
    const out = run({ cwd: two, source: "startup" }, { env: webEnv(rootTwo) });
    const ctx = out.hookSpecificOutput.additionalContext;
    expect(loaded(out)).toBe(false);
    expect(ctx).not.toContain("Finish the parser.");
    expect(ctx).toMatch(/"Web work", branch claude\/one, .*found on remote ref origin\/clear-resume\/claude\/one/);
    expect(out.systemMessage).toContain('"Web work"');
  });

  it("fetches first, so a clone older than the save still finds it", () => {
    freshSessionTwo();
    saveInSessionOne();
    const out = run({ cwd: two, source: "startup" }, { env: webEnv(rootTwo) });
    expect(out.hookSpecificOutput.additionalContext).toContain("found on remote ref origin/clear-resume/claude/one");
  });

  it("fetches first on the same branch too, when the clone predates the push", () => {
    saveInSessionOne("Earlier");
    freshSessionTwo("claude/one");
    run({ cwd: two, source: "startup" }, { env: webEnv(rootTwo) });
    const stale = git(two, "rev-parse", "origin/clear-resume/claude/one");
    saveInSessionOne("Later", "## Next action\nShip the fetch.");
    const out = run({ cwd: two, source: "startup" }, { env: webEnv(rootTwo) });
    // The title alone passed without a fetch too; the ref has to have moved.
    expect(out.hookSpecificOutput.additionalContext).toMatch(/"Later", branch claude\/one, .*found on remote ref origin\/clear-resume\/claude\/one/);
    const pushed = git(two, "ls-remote", "origin", "refs/heads/clear-resume/claude/one").split("\t")[0];
    expect(pushed).not.toBe(stale);
    expect(git(two, "rev-parse", "origin/clear-resume/claude/one")).toBe(pushed);
  });

  it("does not scan other branches unless web mode is on", () => {
    saveInSessionOne();
    freshSessionTwo();
    expect(run({ cwd: two, source: "startup" }, { env: { CLEAR_RESUME_HOME: rootTwo } })).toBeNull();
  });

  it("never pushes: the handover ref, the user's branch and the tree are left as they were", () => {
    saveInSessionOne();
    freshSessionTwo("claude/one");
    const before = repoState(two);
    run({ cwd: two, source: "startup" }, { env: webEnv(rootTwo) });
    expect(repoState(two)).toEqual(before);
    git(two, "fetch", "-q", "origin", "clear-resume/claude/one");
    expect(git(two, "ls-tree", "-r", "--name-only", "FETCH_HEAD")).toBe(REPO_FILE);
  });

  it("lists a committed working-tree copy without loading it, deleting it or committing", () => {
    freshSessionTwo("claude/one");
    const { path } = saveHandover({ cwd: one, title: "Legacy", body: "## Next action\nOld style.", root: rootOne });
    const dest = join(two, REPO_FILE);
    mkdirSync(join(two, ".clear-resume"), { recursive: true });
    writeFileSync(dest, handoverMarkdown(path), "utf8"); // the legacy copy in a worktree is markdown, not a record
    git(two, "add", REPO_FILE);
    git(two, "commit", "-q", "-m", "legacy handover");
    const before = repoState(two);
    const out = run({ cwd: two, source: "startup" }, { env: webEnv(rootTwo) });
    expect(loaded(out)).toBe(false);
    expect(out.hookSpecificOutput.additionalContext).not.toContain("Old style.");
    expect(out.hookSpecificOutput.additionalContext).toMatch(/"Legacy".*found in a file committed to this repo/);
    expect(existsSync(dest)).toBe(true);
    expect(git(two, "log", "-1", "--format=%s")).toBe("legacy handover");
    expect(repoState(two)).toEqual(before);
  });

  it("when the home folder survived, loads the store copy once and leaves the ref alone", () => {
    saveInSessionOne();
    const before = repoState(one);
    const out = run({ cwd: one, source: "clear" }, { env: webEnv(rootOne) });
    expect(out.hookSpecificOutput.additionalContext.match(/Finish the parser\./g)).toHaveLength(1);
    // The same handover on the ref is not listed a second time as found in git.
    expect(out.hookSpecificOutput.additionalContext).not.toContain("found on remote ref");
    expect(repoState(one)).toEqual(before);
    // Silent again for a real later session. An immediate re-run is the twin of
    // the same /clear, which re-emits rather than loading a second time.
    expect(run({ cwd: one, source: "clear" }, { env: webEnv(rootOne), now: new Date(Date.now() + 60_000) })).toBeNull();
  });
});
