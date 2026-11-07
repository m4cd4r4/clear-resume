// save.mjs names each folder in one spelling. It used to print the same folder three ways in one run
// (backslashes, an 8.3 short name, the long name), which read as three places
// (docs/findings-polish-and-launch.md 1.3). These runs hand it a folder spelled another way and
// check that every line names it the long way, forward slashes, the same each time.
// tdd-guard:allow - written against the save.mjs change and checked to fail on the old save.mjs first.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GIT_TEST_TIMEOUT, removeTemp } from "./helpers/git-temp.mjs";

const save = fileURLToPath(new URL("../plugin/scripts/save.mjs", import.meta.url));
const fwd = (p) => p.replace(/\\/g, "/").replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);

let base, home, repo;
beforeEach(() => {
  base = realpathSync.native(mkdtempSync(join(tmpdir(), "cr-save-out-")));
  home = join(base, "home");
  repo = join(base, "work", "widget-shop");
  mkdirSync(home, { recursive: true });
  mkdirSync(join(repo, "src"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@x.invalid", "-c", "user.name=t", "commit", "--allow-empty", "-q", "-m", "init"], { cwd: repo });
});
afterEach(() => removeTemp(base));

function run(cwdArg, cwd) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CODE_SESSION_ID: "", CORNERMAN_AUTO: "", CORNERMAN_HEADLESS: "", CORNERMAN_WEB: "" };
  return execFileSync("node", [save, "--title", "Cart totals rounding", "--cwd", cwdArg], { cwd, input: "# T\n\n## Goal\ng\n", env, encoding: "utf8" });
}

// Every spelling of the fixture folder the output contains, up to and including "widget-shop".
const spellings = (out) => [...new Set([...out.matchAll(/(\S*widget-shop)/g)].map((m) => m[1]))];

// Another spelling of `repo`: a link to it (a junction on Windows, which needs no admin rights),
// with mixed slashes on Windows. longForm follows links the way it expands 8.3 names, so this is
// the same fault as a C:/Users/JOHNSM~1/... temp folder, on any machine.
function otherSpelling() {
  const link = join(base, "link-to-shop");
  symlinkSync(repo, link, process.platform === "win32" ? "junction" : "dir");
  if (process.platform !== "win32") return link;
  let n = 0;
  return link.replace(/\\/g, (m) => (n++ % 2 ? "/" : m));
}

describe("save.mjs output", () => {
  it("puts what happens after /clear straight after the save, ahead of the worktree line", () => {
    const tree = join(base, "work", "widget-shop-fix");
    execFileSync("git", ["worktree", "add", "-q", "-b", "fix/rounding", tree], { cwd: repo });
    const lines = run(tree, tree).trim().split("\n");
    expect(lines[0]).toMatch(/^Saved handover "Cart totals rounding" \(id [0-9a-f]+\)\.$/);
    expect(lines[1]).toBe(`After /clear, the next session in ${fwd(tree)} loads it automatically.`);
    expect(lines[2]).toBe(`It loads only in this worktree, not in ${fwd(repo)}.`);
    expect(lines).toHaveLength(3);
  }, GIT_TEST_TIMEOUT);

  it("names the folder one way when it is handed in another spelling", () => {
    // From a subfolder, so the "Filed against" line names the folder too.
    const out = run(join(otherSpelling(), "src"), repo);
    expect(spellings(out)).toEqual([fwd(repo)]);
    expect(out).not.toMatch(/\\/);
    expect(out).toContain(`Filed against the session root ${fwd(repo)}/src, not the current directory.`);
  }, GIT_TEST_TIMEOUT);

  it("says nothing about the current directory when it is the session root in another spelling", () => {
    const out = run(otherSpelling(), repo);
    expect(out).not.toContain("Filed against");
    expect(spellings(out)).toEqual([fwd(repo)]);
  }, GIT_TEST_TIMEOUT);
});
