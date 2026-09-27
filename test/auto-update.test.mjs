// Pure decision logic for the post-merge/post-rewrite auto-update hook - no
// git, no child_process. The git-integration version of these same questions
// (real branches, real worktrees, real diffs) lives in auto-update-hook.test.mjs.
//
// tdd-guard:allow - backfilled onto scripts/lib/auto-update.mjs and
// auto-update-run.mjs, which were written and manually exercised (see the
// sandbox runs in the PR description) before these tests, not the other way
// round.
import { describe, expect, it, vi } from "vitest";
import { decideAutoUpdate, pluginPathsChanged, PLUGIN_PATH_PREFIXES } from "../scripts/lib/auto-update.mjs";
import { runPluginUpdate } from "../scripts/lib/auto-update-run.mjs";

describe("pluginPathsChanged", () => {
  it("keeps only paths under a shipped prefix", () => {
    const changed = ["scripts/lib/x.mjs", "docs/notes.md", "README.md", "packages/store/store.mjs", ".claude-plugin/plugin.json"];
    expect(pluginPathsChanged(changed)).toEqual(["scripts/lib/x.mjs", "packages/store/store.mjs", ".claude-plugin/plugin.json"]);
  });

  it("is empty for a docs-only change", () => {
    expect(pluginPathsChanged(["README.md", "docs/x.md", "CHANGELOG.md"])).toEqual([]);
  });

  it("treats a missing list as no changes", () => {
    expect(pluginPathsChanged(null)).toEqual([]);
    expect(pluginPathsChanged(undefined)).toEqual([]);
  });

  it("honours an override prefix list instead of the default", () => {
    expect(pluginPathsChanged(["extension/src/x.ts", "scripts/y.mjs"], ["extension/"])).toEqual(["extension/src/x.ts"]);
  });

  it("covers every prefix the plugin actually ships", () => {
    expect(PLUGIN_PATH_PREFIXES).toEqual(["scripts/", "packages/", "hooks/", "skills/", ".claude-plugin/"]);
  });
});

describe("decideAutoUpdate", () => {
  const base = { branch: "main", isPrimaryCheckout: true, changedPaths: ["scripts/lib/x.mjs"] };

  it("runs when on main, in the primary checkout, with a plugin path touched", () => {
    const d = decideAutoUpdate(base);
    expect(d.run).toBe(true);
    expect(d.reason).toContain("scripts/lib/x.mjs");
  });

  it("skips on any branch other than main", () => {
    const d = decideAutoUpdate({ ...base, branch: "feat/whatever" });
    expect(d.run).toBe(false);
    expect(d.reason).toMatch(/feat\/whatever/);
  });

  it("skips on a detached or unreadable HEAD", () => {
    const d = decideAutoUpdate({ ...base, branch: "" });
    expect(d.run).toBe(false);
    expect(d.reason).toMatch(/unknown/);
  });

  it("skips in a linked worktree even on main", () => {
    const d = decideAutoUpdate({ ...base, isPrimaryCheckout: false });
    expect(d.run).toBe(false);
    expect(d.reason).toMatch(/worktree/);
  });

  it("skips when there is nothing to diff against (nothing pulled)", () => {
    const d = decideAutoUpdate({ ...base, changedPaths: null });
    expect(d.run).toBe(false);
    expect(d.reason).toMatch(/nothing was pulled/);
  });

  it("skips a docs-only pull", () => {
    const d = decideAutoUpdate({ ...base, changedPaths: ["README.md", "docs/x.md"] });
    expect(d.run).toBe(false);
    expect(d.reason).toMatch(/did not touch/);
  });

  it("runs on a mix of plugin and non-plugin paths", () => {
    const d = decideAutoUpdate({ ...base, changedPaths: ["README.md", "packages/store/store.mjs"] });
    expect(d.run).toBe(true);
    expect(d.reason).toContain("packages/store/store.mjs");
  });

  it("truncates a long list of touched paths in the reason", () => {
    const changedPaths = ["scripts/a.mjs", "scripts/b.mjs", "scripts/c.mjs", "scripts/d.mjs", "scripts/e.mjs"];
    const d = decideAutoUpdate({ ...base, changedPaths });
    expect(d.run).toBe(true);
    expect(d.reason).toContain("+2 more");
  });
});

describe("runPluginUpdate", () => {
  it("runs the marketplace update then the plugin update, in order", () => {
    const calls = [];
    const run = vi.fn((cmd, args) => calls.push([cmd, args]));
    const result = runPluginUpdate({ run });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      ["claude", ["plugin", "marketplace", "update", "clear-resume"]],
      ["claude", ["plugin", "update", "clear-resume@clear-resume"]],
    ]);
  });

  it("never calls the real claude binary - the injected run is the only thing that can", () => {
    const run = vi.fn();
    runPluginUpdate({ run });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("reports a failure without throwing, and still attempts the second step", () => {
    const run = vi.fn().mockImplementationOnce(() => {
      throw new Error("marketplace fetch failed");
    });
    const result = runPluginUpdate({ run });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("marketplace fetch failed");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("reports both failures when claude is entirely missing", () => {
    const run = vi.fn(() => {
      const err = new Error("ENOENT");
      throw err;
    });
    const result = runPluginUpdate({ run });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("ENOENT");
    expect(run).toHaveBeenCalledTimes(2);
  });
});
