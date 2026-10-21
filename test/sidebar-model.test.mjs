// tdd-guard:allow (backfill: the model was written first, then checked against these)
// The sidebar page draws only what this model hands it, so every label it shows is
// checked here: groups and order match the old tree, nothing is invented, and the
// enhancements (resume peek, age fade, resume on a worktree row, search) behave.
import { describe, expect, it } from "vitest";
import {
  FADE_FLOOR,
  fadeOf,
  filterSections,
  handoverSections,
  lanesModel,
  matches,
  peekOf,
  rowOf,
} from "../extension/src/sidebar-model.ts";

const NOW = new Date("2026-10-21T12:00:00Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const H = 3_600_000;
const D = 24 * H;

const rec = (over = {}) => ({
  id: "a",
  title: "Ship the nudge",
  body: "# Ship the nudge\n\n## Goal\nGet it out.\n\n## Next action\n- Rebase onto origin/main\n- Open the PR\n\n## Notes\nlater",
  resumePrompt: "Resume from handover",
  repo: "clear-resume",
  repoPath: "I:/Scratch/clear-resume",
  branch: "feat/nudge",
  createdAt: ago(3 * H),
  updatedAt: ago(3 * H),
  status: "waiting",
  pinned: false,
  ...over,
});

describe("peekOf", () => {
  it("takes the Next action section, markers dropped", () => {
    expect(peekOf(rec().body)).toEqual(["Rebase onto origin/main", "Open the PR"]);
  });
  it("falls back to the first lines under the title, skipping headings", () => {
    expect(peekOf("# T\n\n## Goal\nOne\nTwo\nThree\nFour")).toEqual(["One", "Two", "Three"]);
  });
  it("cuts a long line and returns nothing for an empty body", () => {
    expect(peekOf("## Next action\n" + "x".repeat(300))[0]).toHaveLength(160);
    expect(peekOf("")).toEqual([]);
  });
});

describe("fadeOf", () => {
  it("is 1 for a fresh handover, falls with age, and never goes below the floor", () => {
    expect(fadeOf(ago(0), NOW)).toBe(1);
    expect(fadeOf(ago(7 * D), NOW)).toBeCloseTo(0.7, 5);
    expect(fadeOf(ago(60 * D), NOW)).toBe(FADE_FLOOR);
  });
  it("treats an unreadable or future date as fresh", () => {
    expect(fadeOf("nonsense", NOW)).toBe(1);
    expect(fadeOf(ago(-H), NOW)).toBe(1);
  });
});

describe("rowOf", () => {
  it("uses the tree's strings: repo and branch, short age", () => {
    const r = rowOf(rec(), NOW);
    expect(r).toMatchObject({ title: "Ship the nudge", meta: "clear-resume \u00b7 feat/nudge", age: "3h", kind: "waiting", pinned: false });
  });
  it("labels a loaded row with its loaded age and a distinct key", () => {
    const loaded = rec({ status: "archived", archivedAt: ago(25 * 60_000), archivedBy: { via: "hook" } });
    const r = rowOf(loaded, NOW, { loaded: true });
    expect(r.age).toBe("loaded 25m ago");
    expect(r.kind).toBe("loaded");
    expect(r.fade).toBe(1);
    expect(r.key).not.toBe(rowOf(loaded, NOW).key);
  });
});

describe("handoverSections", () => {
  const opts = { repoPath: "I:/Scratch/clear-resume", roots: [], now: NOW, showArchived: false };

  it("keeps the tree's groups: Loaded, Current repo, Other repos, Stale", () => {
    const records = [
      rec({ id: "l", status: "archived", archivedAt: ago(60_000), archivedBy: { via: "hook" } }),
      rec({ id: "c" }),
      rec({ id: "o", repoPath: "I:/Scratch/other", repo: "other" }),
      rec({ id: "s", createdAt: ago(40 * D) }),
    ];
    expect(handoverSections(records, opts).map((s) => s.label)).toEqual(["Loaded", "Current repo", "Other repos", "Stale"]);
  });

  it("drops the heading when one group stands alone, but never Loaded's", () => {
    expect(handoverSections([rec()], opts)[0].label).toBe("");
    const loaded = rec({ status: "archived", archivedAt: ago(60_000), archivedBy: { via: "hook" } });
    expect(handoverSections([loaded], opts)[0].label).toBe("Loaded");
  });

  it("shows Archived only when asked", () => {
    const archived = rec({ id: "x", status: "archived", archivedAt: ago(5 * D), archivedBy: { via: "extension" } });
    expect(handoverSections([archived, rec()], opts).map((s) => s.id)).not.toContain("archived");
    expect(handoverSections([archived, rec()], { ...opts, showArchived: true }).map((s) => s.id)).toContain("archived");
  });
});

describe("lanesModel", () => {
  const lane = (over = {}) => ({
    path: "I:/Scratch/app-x",
    branch: "feat/x",
    main: false,
    seq: 2,
    startedAt: "",
    entry: null,
    title: "feat/x",
    context: "",
    why: "",
    state: "handover waiting 3h",
    handovers: [rec()],
    ...over,
  });
  const model = (l) => lanesModel({ lanes: [l], next: [] }, { now: NOW, targetOf: (x) => x.path });

  it("numbers a worktree and leaves the main checkout as its branch", () => {
    expect(model(lane()).lanes[0].title).toBe("2. feat/x");
    expect(model(lane({ main: true })).lanes[0].title).toBe("feat/x");
  });
  it("offers Resume in place only when the newest handover is waiting", () => {
    expect(model(lane()).lanes[0].resumable?.id).toBe("a");
    expect(model(lane({ handovers: [rec({ status: "archived" })] })).lanes[0].resumable).toBeNull();
    expect(model(lane({ handovers: [] })).lanes[0].resumable).toBeNull();
  });
  it("joins the registry's queued entries as Next up", () => {
    const next = [{ short: "U3 \u00b7 ux", context: "plan #1/2", queuedAt: "", entry: { why: "later" } }];
    expect(lanesModel({ lanes: [], next }, { now: NOW, targetOf: () => "" }).next[0]).toMatchObject({ title: "U3 \u00b7 ux", meta: "plan #1/2", why: "later" });
  });
});

describe("search", () => {
  it("needs every word, in any case", () => {
    expect(matches("Ship the nudge clear-resume", "NUDGE ship")).toBe(true);
    expect(matches("Ship the nudge", "nudge cache")).toBe(false);
    expect(matches("anything", "   ")).toBe(true);
  });
  it("narrows sections by title, repo and branch, and drops an emptied group", () => {
    const sections = [
      { id: "current", label: "Current repo", rows: [rowOf(rec(), NOW), rowOf(rec({ id: "b", title: "Other thing", branch: "main" }), NOW)] },
      { id: "other", label: "Other repos", rows: [rowOf(rec({ id: "c", title: "Unrelated", repo: "zzz", branch: "q" }), NOW)] },
    ];
    expect(filterSections(sections, "feat/nudge")).toHaveLength(1);
    expect(filterSections(sections, "feat/nudge")[0].rows.map((r) => r.id)).toEqual(["a"]);
    expect(filterSections(sections, "")).toBe(sections);
  });
});
