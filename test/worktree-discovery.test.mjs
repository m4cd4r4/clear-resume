// A handover written inside a git worktree must be found by a session that
// resumes in the parent checkout.
//
// The incident, 2026-09-23: a session started in a repo's main checkout, a Bash
// `cd` walked it into one of that repo's worktrees, and /handover filed the
// record against the worktree. The user was told to /clear; the fresh session
// started at the main checkout, listWaiting matched repoPath exactly, and found
// nothing. The handover existed and was never offered - silently.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listWaiting, saveHandover } from "../scripts/lib/store.mjs";
import { forgetWorktrees } from "../packages/store/worktree.mjs";

let root, main, tree;

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "ignore" });

beforeEach(() => {
  forgetWorktrees();
  root = mkdtempSync(join(tmpdir(), "cr-wtd-store-"));
  main = mkdtempSync(join(tmpdir(), "cr-wtd-main-"));
  git(main, "init", "-q", "-b", "main");
  git(main, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
  tree = join(main, "..", `cr-wtd-tree-${process.pid}`);
  git(main, "worktree", "add", "-q", "-b", "feature", tree);
});

afterEach(() => {
  forgetWorktrees();
  for (const d of [root, tree, main]) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe("a handover written in a worktree", () => {
  it("is found from the parent checkout", () => {
    saveHandover({ cwd: tree, title: "Carry on", body: "carry on", root });
    expect(listWaiting(root, main).map((h) => h.meta.title)).toEqual(["Carry on"]);
  });

  // The widened match is the regression risk: it must widen to this repo's own
  // checkouts and no further.
  it("does not leak into an unrelated repo", () => {
    const other = mkdtempSync(join(tmpdir(), "cr-wtd-other-"));
    git(other, "init", "-q", "-b", "main");
    git(other, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
    try {
      saveHandover({ cwd: tree, title: "Carry on", body: "carry on", root });
      expect(listWaiting(root, other)).toEqual([]);
    } finally {
      rmSync(other, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});
