import { describe, expect, it } from "vitest";
import { normalise } from "../schema.mjs";
import { group, loadedAge, loadedHere, recentlyLoaded, statusText, treeGroups } from "../view.mjs";

const NOW = new Date("2026-09-20T00:00:00.000Z");
const rec = (over) =>
  normalise({
    title: "t",
    body: "b",
    repoPath: "I:/code/acme",
    machine: "desk",
    pid: 1,
    createdAt: "2026-09-19T12:00:00.000Z",
    ...over,
  });

describe("group", () => {
  it("splits into current repo, other repos, stale and archived", () => {
    const records = [
      rec({ pid: 1, title: "here" }),
      rec({ pid: 2, title: "elsewhere", repoPath: "I:/code/other-repo" }),
      rec({ pid: 3, title: "old", createdAt: "2026-09-01T00:00:00.000Z" }),
      rec({ pid: 4, title: "done", status: "archived", archivedAt: "2026-09-19T13:00:00.000Z" }),
    ];

    const groups = group(records, { repoPath: "i:\\code\\acme", now: NOW });

    expect(groups.map((g) => g.id)).toEqual(["current", "other", "stale", "archived"]);
    expect(Object.fromEntries(groups.map((g) => [g.id, g.records.map((r) => r.title)]))).toEqual({
      current: ["here"],
      other: ["elsewhere"],
      stale: ["old"],
      archived: ["done"],
    });
  });
});

// A handover written in a git worktree carries the worktree's path, so an exact
// path match files it under "Other repos" while its row still reads "acme".
// The worktrees of the open repo are the same repo and belong with it.
describe("worktrees", () => {
  const roots = ["I:/code/acme", "I:/code/acme-ship-preview", "I:/code/acme/.claude/worktrees/agent-a09"];

  it("counts a worktree of the open repo as the current repo", () => {
    const records = [
      rec({ pid: 1, title: "main tree" }),
      rec({ pid: 2, title: "ship preview", repoPath: "I:/code/acme-ship-preview" }),
      rec({ pid: 3, title: "agent worktree", repoPath: "I:/code/acme/.claude/worktrees/agent-a09" }),
      rec({ pid: 4, title: "somewhere else", repoPath: "I:/code/other-repo" }),
    ];

    const groups = group(records, { repoPath: "I:/code/acme", roots, now: NOW });

    expect(Object.fromEntries(groups.map((g) => [g.id, g.records.map((r) => r.title)]))).toEqual({
      current: ["main tree", "ship preview", "agent worktree"],
      other: ["somewhere else"],
    });
  });

  it("counts a subdirectory of a worktree, but not a sibling that merely shares a prefix", () => {
    const records = [
      rec({ pid: 1, title: "inside", repoPath: "I:/code/acme/.clone-kit" }),
      rec({ pid: 2, title: "lookalike", repoPath: "I:/code/acme-unrelated-repo" }),
    ];

    const groups = group(records, { repoPath: "I:/code/acme", roots, now: NOW });

    expect(Object.fromEntries(groups.map((g) => [g.id, g.records.map((r) => r.title)]))).toEqual({
      current: ["inside"],
      other: ["lookalike"],
    });
  });

  it("falls back to the open folder alone when no roots are given", () => {
    const records = [rec({ pid: 1, title: "wt", repoPath: "I:/code/acme-ship-preview" })];
    expect(group(records, { repoPath: "I:/code/acme", now: NOW })[0].id).toBe("other");
  });

  it("is not fooled by windows separators or drive casing in a root", () => {
    const records = [rec({ pid: 1, title: "wt", repoPath: "I:/code/acme-ship-preview" })];
    const groups = group(records, { repoPath: "i:\\code\\acme", roots: ["i:\\code\\acme-ship-preview"], now: NOW });
    expect(groups.map((g) => g.id)).toEqual(["current"]);
    expect(groups[0].records.map((r) => r.title)).toEqual(["wt"]);
  });
});

// The Loaded group and the status-bar item: which handovers a session loaded in
// the last day, so a person can see and reopen the one this window started from.
describe("recently loaded", () => {
  const loaded = (over) => rec({ status: "archived", archivedBy: { owner: "1", pid: "2", via: "hook" }, ...over });

  it("keeps handovers the hook or load.mjs loaded in the last 24 hours, newest first", () => {
    const records = [
      loaded({ pid: 1, title: "3h ago", archivedAt: "2026-09-19T21:00:00.000Z" }),
      loaded({ pid: 2, title: "by load.mjs", archivedAt: "2026-09-19T23:00:00.000Z", archivedBy: { owner: "", pid: "2", via: "load" } }),
      loaded({ pid: 3, title: "yesterday", archivedAt: "2026-09-18T23:00:00.000Z" }),
      loaded({ pid: 4, title: "superseded", archivedAt: "2026-09-19T22:00:00.000Z", archivedBy: { owner: "1", pid: "2", via: "supersede" } }),
      loaded({ pid: 5, title: "from the sidebar", archivedAt: "2026-09-19T22:00:00.000Z", archivedBy: { owner: "", pid: "2", via: "extension" } }),
      rec({ pid: 6, title: "waiting" }),
      rec({ pid: 7, title: "old archive, no stamp", status: "archived", archivedAt: "2026-09-19T22:00:00.000Z" }),
    ];

    expect(recentlyLoaded(records, { now: NOW }).map((r) => r.title)).toEqual(["by load.mjs", "3h ago"]);
  });
});

describe("loaded labels", () => {
  const at = (archivedAt, title = "Cart totals rounding") =>
    rec({ title, status: "archived", archivedAt, archivedBy: { owner: "1", pid: "2", via: "hook" } });

  it("says how long ago it was loaded, and the status bar puts the title first", () => {
    expect(loadedAge(at("2026-09-19T23:59:40.000Z"), NOW)).toBe("loaded just now");
    expect(loadedAge(at("2026-09-19T23:35:00.000Z"), NOW)).toBe("loaded 25m ago");
    expect(loadedAge(at("2026-09-19T21:00:00.000Z"), NOW)).toBe("loaded 3h ago");
    expect(statusText(at("2026-09-19T21:00:00.000Z"), NOW)).toBe("Handover: Cart totals rounding (loaded 3h ago)");
    const long = statusText(at("2026-09-19T21:00:00.000Z", "A very long handover title that goes on and on past the edge"), NOW);
    expect(long).toBe("Handover: A very long handover title that goes on and on... (loaded 3h ago)");
  });
});

describe("the tree's groups", () => {
  it("puts Loaded at the top whatever showArchived says, and leaves Archived to the setting", () => {
    const records = [
      rec({ pid: 1, title: "waiting here" }),
      rec({ pid: 2, title: "loaded 3h ago", status: "archived", archivedAt: "2026-09-19T21:00:00.000Z", archivedBy: { owner: "1", pid: "2", via: "hook" } }),
      rec({ pid: 3, title: "loaded yesterday", status: "archived", archivedAt: "2026-09-18T21:00:00.000Z", archivedBy: { owner: "1", pid: "2", via: "hook" } }),
    ];
    const titles = (groups) => Object.fromEntries(groups.map((g) => [g.id, g.records.map((r) => r.title)]));

    expect(titles(treeGroups(records, { repoPath: "I:/code/acme", now: NOW, showArchived: false }))).toEqual({
      loaded: ["loaded 3h ago"],
      current: ["waiting here"],
    });
    const shown = treeGroups(records, { repoPath: "I:/code/acme", now: NOW, showArchived: true });
    expect(shown.map((g) => g.id)).toEqual(["loaded", "current", "archived"]);
    expect(shown[0].label).toBe("Loaded");
    expect(titles(treeGroups(records.slice(0, 1), { repoPath: "I:/code/acme", now: NOW }))).toEqual({ current: ["waiting here"] });
  });
});

describe("the status bar's handover", () => {
  const loaded = (over) => rec({ status: "archived", archivedBy: { owner: "1", pid: "2", via: "hook" }, ...over });
  const roots = ["I:/code/acme", "I:/code/acme-ship-preview"];

  it("is the newest handover loaded in the last day in the open repo or its worktrees, or none", () => {
    const records = [
      loaded({ pid: 1, title: "acme, 3h ago", archivedAt: "2026-09-19T21:00:00.000Z" }),
      loaded({ pid: 2, title: "worktree, 1h ago", repoPath: "I:/code/acme-ship-preview", archivedAt: "2026-09-19T23:00:00.000Z" }),
      loaded({ pid: 3, title: "other repo, just now", repoPath: "I:/code/other", archivedAt: "2026-09-19T23:59:00.000Z" }),
      loaded({ pid: 4, title: "lookalike, just now", repoPath: "I:/code/acme-unrelated", archivedAt: "2026-09-19T23:59:00.000Z" }),
    ];

    expect(loadedHere(records, { repoPath: "i:\\code\\acme", roots, now: NOW })?.title).toBe("worktree, 1h ago");
    expect(loadedHere(records.slice(0, 1), { repoPath: "I:/code/acme", now: NOW })?.title).toBe("acme, 3h ago");
    expect(loadedHere(records, { repoPath: "I:/code/nothing-loaded", now: NOW })).toBeNull();
    expect(loadedHere(records, { repoPath: "", now: NOW })).toBeNull();
    expect(loadedHere(records.slice(0, 1), { repoPath: "I:/code/acme", now: new Date("2026-09-20T22:00:00.000Z") })).toBeNull();
  });
});
