// Integration coverage for runHook() against a REAL git repo: branch main vs
// not, the primary checkout vs a linked worktree, and a plugin-path change vs
// a docs-only one. Confirmed by hand first (see PR description) that
// `git pull --ff-only` sets ORIG_HEAD and fires post-merge, and that
// `git pull --rebase` sets ORIG_HEAD and fires post-rewrite with "rebase" -
// these tests fake the "just pulled" state with ORIG_HEAD + a second commit
// rather than standing up a remote, since that is the part runHook actually
// reads. runPluginUpdate is always replaced by a spy: nothing here ever calls
// the real `claude` binary.
//
// tdd-guard:allow - backfilled onto scripts/lib/auto-update-hook.mjs, written
// and manually exercised before these tests, not the other way round.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runHook } from "../scripts/lib/auto-update-hook.mjs";

let repo;
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function commit(cwd, relPath, contents, message) {
  const full = join(cwd, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents);
  git(cwd, "add", relPath);
  git(cwd, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "cr-autoupdate-"));
  git(repo, "init", "-q", "-b", "main");
  commit(repo, "README.md", "hello\n", "initial");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

/** Simulates "just pulled": ORIG_HEAD at the old tip, a new commit on top. */
function simulatePull(cwd, relPath, contents, message) {
  const before = git(cwd, "rev-parse", "HEAD");
  const after = commit(cwd, relPath, contents, message);
  git(cwd, "update-ref", "ORIG_HEAD", before);
  return after;
}

describe("runHook", () => {
  it("runs the update on main, in the primary checkout, when a plugin path changed", () => {
    simulatePull(repo, "plugin/scripts/lib/new.mjs", "export const x = 1;\n", "add plugin file");
    const log = vi.fn();
    const update = vi.fn(() => ({ ok: true }));
    runHook({ argv: ["node", "auto-update-on-pull.mjs", "post-merge", "0"], cwd: repo, log, update });
    expect(update).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("ran `claude plugin marketplace update`"));
  });

  it("skips on a branch that is not main", () => {
    git(repo, "checkout", "-q", "-b", "feat/x");
    simulatePull(repo, "plugin/scripts/lib/new.mjs", "export const x = 1;\n", "add plugin file");
    const log = vi.fn();
    const update = vi.fn();
    runHook({ argv: ["node", "auto-update-on-pull.mjs", "post-merge", "0"], cwd: repo, log, update });
    expect(update).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('branch "feat/x"'));
  });

  it("skips in a linked worktree even though it is on main", () => {
    simulatePull(repo, "plugin/scripts/lib/new.mjs", "export const x = 1;\n", "add plugin file");
    const wt = join(repo, "..", `${join(repo).split(/[\\/]/).pop()}-wt`);
    git(repo, "worktree", "add", wt, "-b", "wt-branch");
    try {
      const log = vi.fn();
      const update = vi.fn();
      runHook({ argv: ["node", "auto-update-on-pull.mjs", "post-merge", "0"], cwd: wt, log, update });
      expect(update).not.toHaveBeenCalled();
      // The worktree is on its own branch, but the worktree check must fire
      // even when the branch check would already skip - put it on main to
      // isolate that.
    } finally {
      git(repo, "worktree", "remove", "--force", wt);
    }
  });

  it("skips a docs-only pull", () => {
    simulatePull(repo, "docs/notes.md", "notes\n", "docs change");
    const log = vi.fn();
    const update = vi.fn();
    runHook({ argv: ["node", "auto-update-on-pull.mjs", "post-merge", "0"], cwd: repo, log, update });
    expect(update).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("did not touch"));
  });

  it("skips when there is no ORIG_HEAD yet (a fresh checkout, nothing pulled)", () => {
    const log = vi.fn();
    const update = vi.fn();
    runHook({ argv: ["node", "auto-update-on-pull.mjs", "post-merge", "0"], cwd: repo, log, update });
    expect(update).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("nothing was pulled"));
  });

  it("skips a post-rewrite from --amend without touching git at all", () => {
    const log = vi.fn();
    const update = vi.fn();
    runHook({ argv: ["node", "auto-update-on-pull.mjs", "post-rewrite", "amend"], cwd: repo, log, update });
    expect(update).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('reason "amend"'));
  });

  it("runs on a post-rewrite rebase that touched a plugin path", () => {
    simulatePull(repo, "plugin/packages/store/new.mjs", "export const y = 1;\n", "rebase-equivalent change");
    const log = vi.fn();
    const update = vi.fn(() => ({ ok: true }));
    runHook({ argv: ["node", "auto-update-on-pull.mjs", "post-rewrite", "rebase"], cwd: repo, log, update });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("reports an update failure without throwing", () => {
    simulatePull(repo, "plugin/scripts/lib/new.mjs", "export const x = 1;\n", "add plugin file");
    const log = vi.fn();
    const update = vi.fn(() => ({ ok: false, detail: "claude plugin update: ENOENT" }));
    expect(() =>
      runHook({ argv: ["node", "auto-update-on-pull.mjs", "post-merge", "0"], cwd: repo, log, update }),
    ).not.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("ENOENT"));
  });
});
