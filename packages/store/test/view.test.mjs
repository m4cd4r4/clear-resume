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
