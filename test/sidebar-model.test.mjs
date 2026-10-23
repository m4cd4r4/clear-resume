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
  it("says the worktree and the branch once when one repeats the other", () => {
    const meta = (repo, branch) => rowOf(rec({ repo, branch }), NOW).meta;
    expect(meta("clear-resume-restyle-webview", "feat/restyle-webview")).toBe("clear-resume-restyle-webview");
    expect(meta("clear-resume", "clear-resume/fix-x")).toBe("clear-resume/fix-x");
    expect(meta("main", "main")).toBe("main");
    expect(meta("clear-resume", "feat/restyle-webview")).toBe("clear-resume · feat/restyle-webview");
    expect(meta("domain-site", "feat/main")).toBe("domain-site · feat/main");
    expect(meta("clear-resume", "")).toBe("clear-resume");
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

  it("puts waiting groups above a Loaded handover from another repo, then Stale", () => {
    const records = [
      rec({ id: "l", status: "archived", archivedAt: ago(60_000), archivedBy: { via: "hook" }, repoPath: "I:/Scratch/elsewhere", repo: "elsewhere" }),
      rec({ id: "c" }),
      rec({ id: "o", repoPath: "I:/Scratch/other", repo: "other" }),
      rec({ id: "s", createdAt: ago(40 * D) }),
    ];
    expect(handoverSections(records, opts).map((s) => s.label)).toEqual(["Current repo", "Other repos", "Loaded", "Stale"]);
  });

  it("puts Loaded first when the loaded handover is from this repo or its worktrees", () => {
    const loaded = (id, repoPath) => rec({ id, status: "archived", archivedAt: ago(60_000), archivedBy: { via: "hook" }, repoPath });
    const waiting = [rec({ id: "c" }), rec({ id: "o", repoPath: "I:/Scratch/other", repo: "other" })];
    const order = (records, o = opts) => handoverSections(records, o).map((s) => s.id);
    expect(order([...waiting, loaded("l", "I:/Scratch/clear-resume")])).toEqual(["loaded", "current", "other"]);
    // A sibling worktree counts when the caller passes it in roots.
    const sibling = "I:/Scratch/clear-resume-sidebar";
    expect(order([...waiting, loaded("l", sibling)], { ...opts, roots: [sibling] })).toEqual(["loaded", "current", "other"]);
  });

  it("drops the heading when one group stands alone, but never Loaded's", () => {
    expect(handoverSections([rec()], opts)[0].label).toBe("");
    const loaded = rec({ status: "archived", archivedAt: ago(60_000), archivedBy: { via: "hook" } });
    expect(handoverSections([loaded], opts)[0].label).toBe("Loaded");
  });

  it("collapses Stale and Archived by default and keeps a lone one's heading", () => {
    const archived = rec({ id: "x", status: "archived", archivedAt: ago(5 * D), archivedBy: { via: "extension" } });
    const stale = rec({ id: "s", createdAt: ago(40 * D) });
    const all = handoverSections([rec(), stale, archived], { ...opts, showArchived: true });
    expect(Object.fromEntries(all.map((s) => [s.id, s.collapsed]))).toEqual({ current: false, stale: true, archived: true });
    const lone = handoverSections([archived], { ...opts, showArchived: true });
    expect(lone.map((s) => [s.label, s.collapsed])).toEqual([["Archived", true]]);
  });

  it("groups Stale and Archived by the repo's main folder, newest repo first, with a count", () => {
    const stale = (id, repoPath, mainPath, age) => rec({ id, repoPath, mainPath, createdAt: ago(age * D) });
    const records = [
      stale("a", "I:/Scratch/examworthy-seal-flip", "I:/Scratch/examworthy", 50),
      stale("b", "I:/Scratch/solaisoft", "I:/Scratch/solaisoft", 41),
      stale("c", "I:/Scratch/examworthy-seal-app", "I:/Scratch/examworthy", 45),
      stale("d", "I:/Scratch/old-worktree", undefined, 60),
    ];
    const [section] = handoverSections(records, opts);
    expect(section.groups?.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ["solaisoft", ["b"]],
      ["examworthy", ["c", "a"]],
      // A record written before mainPath existed falls back to its own folder.
      ["old-worktree", ["d"]],
    ]);
    // The flat rows stay, so the section count and the search still see every record.
    expect(section.rows).toHaveLength(4);
  });

  it("splits Other repos by repo too, open, while Stale's repo groups start closed", () => {
    const other = (id, repoPath, mainPath) => rec({ id, repoPath, mainPath });
    const records = [
      other("a", "I:/Scratch/solaisoft", "I:/Scratch/solaisoft"),
      other("b", "I:/Scratch/examworthy-seal-flip", "I:/Scratch/examworthy"),
      rec({ id: "s", repoPath: "I:/Scratch/old", mainPath: "I:/Scratch/old", createdAt: ago(40 * D) }),
    ];
    const sections = handoverSections(records, opts);
    const by = Object.fromEntries(sections.map((s) => [s.id, s.groups?.map((g) => [g.label, g.collapsed])]));
    expect(by.other).toEqual([["solaisoft", false], ["examworthy", false]]);
    expect(by.stale).toEqual([["old", true]]);
    // The repo you are in is its own heading, so it needs no split.
    expect(by.current).toBeUndefined();
  });

  it("makes rows one line wherever a heading already names the repo, and not in Loaded", () => {
    const records = [
      rec({ id: "l", status: "archived", archivedAt: ago(60_000), archivedBy: { via: "hook" } }),
      rec({ id: "c" }),
      rec({ id: "o", repoPath: "I:/Scratch/other", repo: "other", mainPath: "I:/Scratch/other" }),
      rec({ id: "s", createdAt: ago(40 * D) }),
    ];
    const compact = Object.fromEntries(handoverSections(records, opts).map((s) => [s.id, s.rows.map((r) => r.compact)]));
    expect(compact).toEqual({ loaded: [true], current: [true], other: [true], stale: [true] });
    // Only Loaded rows tag the repo; the other groups already name it in their heading.
    expect(Object.fromEntries(handoverSections(records, opts).map((s) => [s.id, s.rows.map((r) => r.tag)]))).toEqual({ loaded: ["clear-resume"], current: [""], other: [""], stale: [""] });
    // The row still carries the repo and branch, for its tooltip and its peek.
    expect(handoverSections(records, opts).find((s) => s.id === "other")?.rows[0].meta).toBe("other \u00b7 feat/nudge");
  });

  it("keeps the heading of a lone section that has repo groups under it", () => {
    const only = [rec({ id: "o", repoPath: "I:/Scratch/other", repo: "other", mainPath: "I:/Scratch/other" })];
    expect(handoverSections(only, opts)[0].label).toBe("Other repos");
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
  it("narrows a section's repo groups to the matching rows and drops the ones left empty", () => {
    const stale = (id, title, mainPath) => rec({ id, title, repoPath: mainPath, mainPath, createdAt: ago(40 * D) });
    const opts = { repoPath: "I:/Scratch/clear-resume", roots: [], now: NOW, showArchived: false };
    const [section] = handoverSections([stale("a", "Ship nudge", "I:/Scratch/alpha"), stale("b", "Fix footer", "I:/Scratch/beta")], opts);
    const [hit] = filterSections([section], "footer");
    expect(hit.rows.map((r) => r.id)).toEqual(["b"]);
    expect(hit.groups?.map((g) => g.label)).toEqual(["beta"]);
  });
  it("still finds a row by a branch its second line no longer shows", () => {
    const row = rowOf(rec({ repo: "clear-resume-restyle-webview", branch: "feat/restyle-webview" }), NOW);
    expect(row.meta).not.toContain("feat/");
    expect(filterSections([{ id: "current", label: "", rows: [row] }], "feat/restyle")).toHaveLength(1);
  });
});
