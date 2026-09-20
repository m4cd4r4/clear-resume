import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { realpathSync } from "node:fs";
import { normalisePath } from "../schema.mjs";

const real = (p) => normalisePath(realpathSync.native(p));
import { forgetWorktrees, worktreePaths } from "../worktree.mjs";

vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

let tmp;
const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "ignore" });

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cr-wt-"));
  forgetWorktrees();
});
afterEach(() => {
  forgetWorktrees();
  rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe("worktreePaths", () => {
  it("lists the main checkout and every worktree of it", () => {
    const main = join(tmp, "repo");
    mkdirSync(main, { recursive: true });
    git(main, "init", "-q", "-b", "main");
    git(main, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
    const side = join(tmp, "repo-feature");
    git(main, "worktree", "add", "-q", "-b", "feature", side);

    // Asked with a short 8.3 spelling, answered in the long form git prints. The
    // point is that both name the same folder and compare equal afterwards.
    const paths = worktreePaths(main);
    expect(paths).toContain(real(main));
    expect(paths).toContain(real(side));
    expect(paths).toHaveLength(2);
  });

  it("gives the same set whichever checkout you ask from", () => {
    const main = join(tmp, "repo");
    mkdirSync(main, { recursive: true });
    git(main, "init", "-q", "-b", "main");
    git(main, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
    const side = join(tmp, "repo-feature");
    git(main, "worktree", "add", "-q", "-b", "feature", side);

    const fromMain = [...worktreePaths(main)].sort();
    forgetWorktrees();
    const fromSide = [...worktreePaths(side)].sort();
    expect(fromSide).toEqual(fromMain);
  });

  it("returns the folder alone when it is not a repo", () => {
    const plain = join(tmp, "not-a-repo");
    mkdirSync(plain, { recursive: true });
    expect(worktreePaths(plain)).toEqual([real(plain)]);
  });

  // A VS Code window with no folder open. The tree still has to render.
  it("returns nothing for no folder at all", () => {
    expect(worktreePaths("")).toEqual([]);
    expect(worktreePaths(undefined)).toEqual([]);
  });

  it("answers a second time without shelling out again", () => {
    const main = join(tmp, "repo2");
    mkdirSync(main, { recursive: true });
    git(main, "init", "-q", "-b", "main");
    const first = worktreePaths(main);

    // The folder is gone, so only the memo can still answer with its contents.
    rmSync(main, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    expect(worktreePaths(main)).toBe(first);
  });
});
