// tdd-guard:allow - web-fallback rules, each mutation-checked.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { run } from "../scripts/lib/hook.mjs";
import { saveHandover } from "../scripts/lib/store.mjs";
import { commitHandover, remoteBranches, REPO_FILE } from "../scripts/lib/web.mjs";

const SAVE = join(import.meta.dirname, "../scripts/save.mjs");
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
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// Session 1 saves in web mode; session 2 is a fresh clone with an empty home folder.
function saveInSessionOne(title = "Web work", body = "## Next action\nFinish the parser.") {
  return execFileSync(process.execPath, [SAVE, "--title", title], {
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

describe("save in web mode", () => {
  it("commits only the handover file, leaving the user's own work alone, and pushes", () => {
    writeFileSync(join(one, "staged.txt"), "mine");
    git(one, "add", "staged.txt");
    writeFileSync(join(one, "untracked.txt"), "mine");
    const out = saveInSessionOne();
    expect(out).toMatch(/Committed and pushed/);
    expect(git(one, "show", "--name-only", "--format=", "HEAD")).toBe(REPO_FILE);
    expect(git(one, "status", "--porcelain")).toBe("A  staged.txt\n?? untracked.txt");
    expect(git(one, "ls-remote", "origin", "claude/one")).not.toBe("");
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
    const r = commitHandover(one, path);
    expect(r.committed).toBe(true);
    expect(r.pushed).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe("load in a new cloud session", () => {
  it("finds the handover on another pushed branch, once", () => {
    saveInSessionOne();
    freshSessionTwo();
    const out = run({ cwd: two, source: "startup" }, { env: webEnv(rootTwo) });
    expect(out.hookSpecificOutput.additionalContext).toContain("Finish the parser.");
    expect(out.hookSpecificOutput.additionalContext).toContain("written on branch claude/one");
    expect(run({ cwd: two, source: "startup" }, { env: webEnv(rootTwo) })).toBeNull();
  });

  it("fetches first, so a clone older than the save still finds it", () => {
    freshSessionTwo();
    saveInSessionOne();
    const out = run({ cwd: two, source: "startup" }, { env: webEnv(rootTwo) });
    expect(out.hookSpecificOutput.additionalContext).toContain("Finish the parser.");
  });

  it("fetches first on the same branch too, when the clone predates the push", () => {
    saveInSessionOne("Earlier");
    freshSessionTwo("claude/one");
    run({ cwd: two, source: "startup" }, { env: webEnv(rootTwo) });
    saveInSessionOne("Later", "## Next action\nShip the fetch.");
    const out = run({ cwd: two, source: "startup" }, { env: webEnv(rootTwo) });
    expect(out.hookSpecificOutput.additionalContext).toContain("Ship the fetch.");
  });

  it("does not scan other branches unless web mode is on", () => {
    saveInSessionOne();
    freshSessionTwo();
    expect(run({ cwd: two, source: "startup" }, { env: { CLEAR_RESUME_HOME: rootTwo } })).toBeNull();
  });

  it("on the same branch, loads the working-tree copy and deletes it in a commit", () => {
    saveInSessionOne();
    freshSessionTwo("claude/one");
    const out = run({ cwd: two, source: "startup" }, { env: webEnv(rootTwo) });
    expect(out.hookSpecificOutput.additionalContext).toContain("Finish the parser.");
    expect(existsSync(join(two, REPO_FILE))).toBe(false);
    expect(git(two, "log", "-1", "--format=%s")).toBe("chore: clear-resume handover loaded");
    expect(git(two, "status", "--porcelain")).toBe("");
  });

  it("when the home folder survived, loads the store copy once and clears the git copy", () => {
    saveInSessionOne();
    const out = run({ cwd: one, source: "clear" }, { env: webEnv(rootOne) });
    expect(out.hookSpecificOutput.additionalContext.match(/Finish the parser\./g)).toHaveLength(1);
    expect(existsSync(join(one, REPO_FILE))).toBe(false);
    expect(run({ cwd: one, source: "clear" }, { env: webEnv(rootOne) })).toBeNull();
  });
});
