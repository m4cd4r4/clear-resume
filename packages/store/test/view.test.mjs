import { describe, expect, it } from "vitest";
import { normalise } from "../schema.mjs";
import { group } from "../view.mjs";

const NOW = new Date("2026-09-20T00:00:00.000Z");
const rec = (over) =>
  normalise({
    title: "t",
    body: "b",
    repoPath: "I:/Scratch/solaisoft",
    machine: "desk",
    pid: 1,
    createdAt: "2026-09-19T12:00:00.000Z",
    ...over,
  });

describe("group", () => {
  it("splits into current repo, other repos, stale and archived", () => {
    const records = [
      rec({ pid: 1, title: "here" }),
      rec({ pid: 2, title: "elsewhere", repoPath: "I:/Scratch/clear-resume" }),
      rec({ pid: 3, title: "old", createdAt: "2026-09-01T00:00:00.000Z" }),
      rec({ pid: 4, title: "done", status: "archived", archivedAt: "2026-09-19T13:00:00.000Z" }),
    ];

    const groups = group(records, { repoPath: "i:\\Scratch\\solaisoft", now: NOW });

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
// path match files it under "Other repos" while its row still reads "solaisoft".
// The worktrees of the open repo are the same repo and belong with it.
describe("worktrees", () => {
  const roots = ["I:/Scratch/solaisoft", "I:/Scratch/solaisoft-ship-preview", "I:/Scratch/solaisoft/.claude/worktrees/agent-a09"];

  it("counts a worktree of the open repo as the current repo", () => {
    const records = [
      rec({ pid: 1, title: "main tree" }),
      rec({ pid: 2, title: "ship preview", repoPath: "I:/Scratch/solaisoft-ship-preview" }),
      rec({ pid: 3, title: "agent worktree", repoPath: "I:/Scratch/solaisoft/.claude/worktrees/agent-a09" }),
      rec({ pid: 4, title: "somewhere else", repoPath: "I:/Scratch/clear-resume" }),
    ];

    const groups = group(records, { repoPath: "I:/Scratch/solaisoft", roots, now: NOW });

    expect(Object.fromEntries(groups.map((g) => [g.id, g.records.map((r) => r.title)]))).toEqual({
      current: ["main tree", "ship preview", "agent worktree"],
      other: ["somewhere else"],
    });
  });

  it("counts a subdirectory of a worktree, but not a sibling that merely shares a prefix", () => {
    const records = [
      rec({ pid: 1, title: "inside", repoPath: "I:/Scratch/solaisoft/.clone-kit" }),
      rec({ pid: 2, title: "lookalike", repoPath: "I:/Scratch/solaisoft-unrelated-repo" }),
    ];

    const groups = group(records, { repoPath: "I:/Scratch/solaisoft", roots, now: NOW });

    expect(Object.fromEntries(groups.map((g) => [g.id, g.records.map((r) => r.title)]))).toEqual({
      current: ["inside"],
      other: ["lookalike"],
    });
  });

  it("falls back to the open folder alone when no roots are given", () => {
    const records = [rec({ pid: 1, title: "wt", repoPath: "I:/Scratch/solaisoft-ship-preview" })];
    expect(group(records, { repoPath: "I:/Scratch/solaisoft", now: NOW })[0].id).toBe("other");
  });

  it("is not fooled by windows separators or drive casing in a root", () => {
    const records = [rec({ pid: 1, title: "wt", repoPath: "I:/Scratch/solaisoft-ship-preview" })];
    const groups = group(records, { repoPath: "i:\\Scratch\\solaisoft", roots: ["i:\\Scratch\\solaisoft-ship-preview"], now: NOW });
    expect(groups.map((g) => g.id)).toEqual(["current"]);
    expect(groups[0].records.map((r) => r.title)).toEqual(["wt"]);
  });
});
