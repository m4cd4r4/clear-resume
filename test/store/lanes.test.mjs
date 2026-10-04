// Backfilled onto lanes.mjs after it was written (tdd-guard:allow), then each
// assertion was broken once by hand to check it can fail.
import { describe, expect, it } from "vitest";
import { normalise } from "../../plugin/packages/store/schema.mjs";
import { entryLabel, lanes, laneState, parseWorktreeList, planPosition, rowId, waveOf } from "../../plugin/packages/store/lanes.mjs";

const NOW = new Date("2026-10-04T08:00:00.000Z");
const entry = (over) => ({ slug: "s", branch: "feat/s", repo_path: "I:/code/acme", status: "materialised", created_at: "2026-10-01T00:00:00Z", ...over });
const rec = (over) =>
  normalise({ title: "t", body: "b", repoPath: "I:/code/acme", machine: "desk", pid: 1, createdAt: "2026-10-04T06:00:00.000Z", ...over });

describe("rowId", () => {
  it("prefers the label field", () => expect(rowId({ label: "U9", why: "UX plan U3: x" })).toBe("U9"));
  it("finds a row id in the why prose", () => {
    expect(rowId({ why: "UX plan U3: Practice becomes Study" })).toBe("U3");
    expect(rowId({ why: "examworthy redesign Wave 2 row 4a (docs/...)" })).toBe("row 4a");
    expect(rowId({ why: "Wave 2 W2-d: add coverage" })).toBe("W2-d");
  });
  it("is empty when nothing names a row", () => expect(rowId({ why: "tidy the footer" })).toBe(""));
});

describe("waveOf", () => {
  it("reads the field, then a tag", () => {
    expect(waveOf({ wave: 0 })).toBe(0);
    expect(waveOf({ tags: ["ux-plan", "wave-2"] })).toBe(2);
    expect(waveOf({ tags: ["wave1"] })).toBe(1);
    expect(waveOf({ tags: [] })).toBeNull();
  });
});

describe("planPosition and entryLabel", () => {
  const entries = [
    entry({ slug: "a", plan: "p", created_at: "2026-10-01T00:00:00Z" }),
    entry({ slug: "gone", plan: "p", status: "archived", created_at: "2026-10-01T12:00:00Z" }),
    entry({ slug: "b", plan: "p", created_at: "2026-10-02T00:00:00Z", why: "UX plan U3: x", tags: ["wave-2"] }),
    entry({ slug: "solo", plan: null }),
  ];
  it("orders siblings by creation and skips archived ones", () => {
    expect(planPosition(entries[2], entries)).toEqual({ plan: "p", seq: 2, total: 2 });
    expect(planPosition(entries[3], entries)).toBeNull();
  });
  it("builds the short and context strings", () => {
    expect(entryLabel(entries[2], entries)).toMatchObject({ short: "U3 · b", context: "p #2/2 · wave 2" });
    expect(entryLabel(entries[3], entries)).toMatchObject({ short: "solo", context: "" });
  });
});

describe("parseWorktreeList", () => {
  it("marks the first as main and strips refs/heads", () => {
    const out = "worktree I:/code/acme\nHEAD 1\nbranch refs/heads/main\n\nworktree i:\\code\\acme-x\nHEAD 2\ndetached\n";
    expect(parseWorktreeList(out)).toEqual([
      { path: "I:/code/acme", branch: "main", detached: false, main: true },
      { path: "I:/code/acme-x", branch: "", detached: true, main: false },
    ]);
  });
});

describe("laneState", () => {
  it("names the newest handover's state", () => {
    expect(laneState([], NOW)).toBe("no handover");
    expect(laneState([rec({})], NOW)).toBe("handover waiting 2h");
    const loaded = rec({ status: "archived", archivedAt: "2026-10-04T07:00:00.000Z", archivedBy: { via: "hook", owner: "", pid: "1" } });
    expect(laneState([loaded], NOW)).toBe("loaded 1h ago");
  });
});

describe("lanes", () => {
  const worktrees = [
    { path: "I:/code/acme", branch: "main", main: true, startedAt: "" },
    { path: "I:/code/acme-late", branch: "feat/late", main: false, startedAt: "2026-10-04T03:00:00Z" },
    { path: "I:/code/acme-early", branch: "feat/early", main: false, startedAt: "2026-10-04T01:00:00Z" },
  ];
  const entries = [
    entry({ slug: "early", branch: "feat/early", worktree_path: "I:/code/acme-early", why: "UX plan U1: x", plan: "ux" }),
    entry({ slug: "queued", branch: "feat/queued", status: "later", why: "UX plan U4: y", plan: "ux", created_at: "2026-10-03T00:00:00Z" }),
    entry({ slug: "elsewhere", status: "later", repo_path: "I:/code/other" }),
  ];

  it("puts main first, then worktrees oldest first, numbered", () => {
    const { lanes: rows } = lanes({ worktrees, entries, now: NOW });
    expect(rows.map((r) => [r.seq, r.title])).toEqual([
      [undefined, "main"],
      [1, "U1 · early"],
      [2, "feat/late"],
    ]);
  });

  it("files handovers under the lane they were written in", () => {
    const records = [rec({ repoPath: "I:/code/acme-late", title: "late one" }), rec({ pid: 2, title: "main one" })];
    const { lanes: rows } = lanes({ worktrees, entries, records, now: NOW });
    expect(rows.find((r) => r.branch === "feat/late").handovers.map((h) => h.title)).toEqual(["late one"]);
    expect(rows.find((r) => r.main).handovers.map((h) => h.title)).toEqual(["main one"]);
  });

  it("lists this repo's queued entries as next up", () => {
    const { next } = lanes({ worktrees, entries, now: NOW });
    expect(next.map((n) => n.short)).toEqual(["U4 · queued"]);
  });
});
