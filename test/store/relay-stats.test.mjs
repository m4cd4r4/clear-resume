// tdd-guard:allow (backfill: relay-stats.mjs was written first from the brief's decided output, then checked against these)
// Relay stats (docs/no-bloat/PROJECT-PLAN.md, wave 3): the ledger and the live relay
// files counted together, by month and repo, and the two ways they are shown.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerLine } from "../../plugin/packages/store/relay-retention.mjs";
import { ledgerWindows, liveWindows, previousMonth, readRelayStats, relayStats, statsText, thisMonth } from "../../plugin/packages/store/relay-stats.mjs";

const DAY = 86_400_000;
// Local time, so the month boundary is the one the ledger file names use.
const NOW = new Date(2026, 10, 20, 12, 0, 0).getTime();
const OCT = new Date(2026, 9, 15, 12, 0, 0).getTime();
let seq = 0;
const keyAt = (ms) => `${ms.toString(36)}-k${(seq++).toString(36)}`;
const win = (o = {}) => {
  const updatedAt = o.updatedAt ?? NOW - DAY;
  return { v: 1, key: o.key ?? keyAt(updatedAt - DAY), cwd: "/work/repo-a", sessions: ["s1"], limit: 15, configured: 15, used: 1, stalled: 0, applied: 0, ...o, updatedAt };
};
const ledger = (...ws) => ws.map((w) => ledgerLine(w, NOW) + "\n").join("");
const row = (stats, month, repo) => stats.get(month)?.get(repo);

describe("relayStats", () => {
  it("counts a window in both the ledger and the live folder once, as its live file says", () => {
    const w = win({ used: 2, sessions: ["s1"] });
    const now = { ...w, used: 5, sessions: ["s1", "s2"] };
    const stats = relayStats({ ledgers: [ledger(w)], live: [now] });
    expect(row(stats, "2026-11", "repo-a")).toEqual({ windows: 1, sessions: 2, relays: 5 });
  });

  it("files a window under the month of its last change, local time, so the live file can move it out of a ledger month", () => {
    const w = win({ updatedAt: OCT });
    const live = { ...w, updatedAt: NOW - DAY };
    expect(row(relayStats({ ledgers: [ledger(w)] }), "2026-10", "repo-a")?.windows).toBe(1);
    const both = relayStats({ ledgers: [ledger(w)], live: [live] });
    expect(both.get("2026-10")).toBeUndefined();
    expect(row(both, "2026-11", "repo-a")?.windows).toBe(1);
    // One millisecond either side of local midnight on the 1st.
    const first = new Date(2026, 10, 1, 0, 0, 0).getTime();
    const edge = relayStats({ live: [win({ updatedAt: first - 1 }), win({ updatedAt: first })] });
    expect(row(edge, "2026-10", "repo-a")?.windows).toBe(1);
    expect(row(edge, "2026-11", "repo-a")?.windows).toBe(1);
  });

  it("skips lines that do not parse, other kinds and unknown versions, without throwing", () => {
    const good = ledger(win({ used: 3 }));
    const text = ["{torn", "", JSON.stringify({ v: 1, kind: "card", key: "x", lastAt: NOW }), JSON.stringify({ v: 2, kind: "relay", key: "y", lastAt: NOW, used: 9 }), "null", "42", good].join("\n");
    expect(ledgerWindows(text)).toHaveLength(1);
    expect(row(relayStats({ ledgers: [text] }), "2026-11", "repo-a")).toEqual({ windows: 1, sessions: 1, relays: 3 });
  });

  it("does not sum applied, which is a timestamp", () => {
    const stats = relayStats({ ledgers: [ledger(win({ used: 2, applied: NOW - 3 * DAY }))], live: [win({ used: 1, applied: NOW })] });
    expect(row(stats, "2026-11", "repo-a")?.relays).toBe(3);
  });

  it("counts three sessions in one folder that share one window as one window and three sessions", () => {
    const shared = win({ cwd: "/work/repo-a", sessions: ["s1", "s2", "s3"], used: 2 });
    expect(row(relayStats({ live: [shared] }), "2026-11", "repo-a")).toEqual({ windows: 1, sessions: 3, relays: 2 });
    // Three windows in that folder, one session each, are three windows.
    const three = ["s1", "s2", "s3"].map((s) => win({ sessions: [s], used: 1 }));
    expect(row(relayStats({ live: three }), "2026-11", "repo-a")).toEqual({ windows: 3, sessions: 3, relays: 3 });
  });

  it("keeps a key seen twice in the ledger once, from its latest line", () => {
    const w = win({ updatedAt: NOW - 3 * DAY, used: 1 });
    const later = { ...w, updatedAt: NOW - DAY, used: 4 };
    expect(row(relayStats({ ledgers: [ledger(w), ledger(later)] }), "2026-11", "repo-a")).toEqual({ windows: 1, sessions: 1, relays: 4 });
  });

  it("names the repo by the folder's last name, either separator", () => {
    const stats = relayStats({ live: [win({ cwd: "C:\\work\\repo-b" }), win({ cwd: "/work/repo-c/" })] });
    expect([...stats.get("2026-11").keys()].sort()).toEqual(["repo-b", "repo-c"]);
  });
});

describe("thisMonth", () => {
  it("is one line of counts and the top three repos by relays", () => {
    const live = [
      ...Array.from({ length: 4 }, () => win({ cwd: "/work/repo-a", used: 5 })),
      win({ cwd: "/work/repo-b", used: 7 }),
      win({ cwd: "/work/repo-c", used: 7 }),
      win({ cwd: "/work/repo-d", used: 1 }),
    ];
    expect(thisMonth(relayStats({ live }), NOW)).toEqual({
      counts: "7 windows · 35 relays · 4 repos",
      top: [{ repo: "repo-a", relays: "20 relays" }, { repo: "repo-b", relays: "7 relays" }, { repo: "repo-c", relays: "7 relays" }],
    });
  });

  it("says 1 window, 1 relay, 1 repo", () => {
    expect(thisMonth(relayStats({ live: [win({ used: 1 })] }), NOW)).toEqual({ counts: "1 window · 1 relay · 1 repo", top: [{ repo: "repo-a", relays: "1 relay" }] });
  });

  it("names no repo that has no relays", () => {
    expect(thisMonth(relayStats({ live: [win({ used: 0 })] }), NOW)).toEqual({ counts: "1 window · 0 relays · 1 repo", top: [] });
  });

  it("is left out when this month has no window, even with last month full", () => {
    expect(thisMonth(relayStats({ live: [win({ updatedAt: OCT })] }), NOW)).toBeUndefined();
    expect(thisMonth(relayStats({}), NOW)).toBeUndefined();
  });
});

describe("statsText", () => {
  it("prints this month by repo, most relays first then by name, a total, then last month on one line", () => {
    const live = [
      win({ cwd: "/work/repo-a", sessions: ["a", "b"], used: 3 }),
      win({ cwd: "/work/repo-a", sessions: ["c"], used: 2 }),
      win({ cwd: "/work/repo-c", sessions: ["d"], used: 4 }),
      win({ cwd: "/work/repo-b", sessions: ["e", "f", "g"], used: 4 }),
    ];
    const october = ledger(win({ updatedAt: OCT, used: 6 }), win({ updatedAt: OCT, cwd: "/work/repo-b", used: 1 }));
    expect(statsText(relayStats({ ledgers: [october], live }), NOW)).toBe(
      [
        "cornerman stats, November 2026",
        "",
        "repo     windows  sessions  relays",
        "repo-a         2         3       5",
        "repo-b         1         3       4",
        "repo-c         1         1       4",
        "total          4         7      13",
        "",
        "October 2026: 2 windows, 7 relays",
        "",
      ].join("\n"),
    );
  });

  it("leaves out last month when it had nothing, and says 1 window and 1 relay", () => {
    const text = statsText(relayStats({ live: [win({ used: 1 })], ledgers: [ledger(win({ updatedAt: OCT, used: 1 }))] }), NOW);
    expect(text).toContain("October 2026: 1 window, 1 relay");
    expect(statsText(relayStats({ live: [win()] }), NOW)).not.toContain("October");
  });

  it("widens the columns for long repo names and large counts", () => {
    const text = statsText(relayStats({ live: [win({ cwd: "/work/a-much-longer-repo-name", used: 1234567 })] }), NOW);
    const [head, first] = text.split("\n").slice(2, 4);
    expect(head.length).toBe(first.length);
    expect(first.endsWith("1234567")).toBe(true);
  });

  it("says there is nothing yet when there is nothing at all", () => {
    expect(statsText(relayStats({}), NOW)).toBe("cornerman stats: no relay windows yet.\n");
  });

  it("shows an empty month as a zero total when last month has windows", () => {
    const text = statsText(relayStats({ live: [win({ updatedAt: OCT })] }), NOW);
    expect(text).toContain("total         0         0       0");
    expect(text).toContain("October 2026: 1 window, 1 relay");
  });
});

describe("previousMonth", () => {
  it("steps back across a year", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-11")).toBe("2026-10");
  });
});

describe("liveWindows", () => {
  it("keeps only relay files windowFrom would keep", () => {
    const w = win();
    expect(liveWindows([w, { ...w, v: 2 }, { ...w, key: "notes" }, null, { key: w.key }])).toEqual([w]);
  });
});

describe("readRelayStats", () => {
  let store;
  beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), "cr-relay-stats-"));
    mkdirSync(join(store, "relay"));
    mkdirSync(join(store, "ledger"));
  });
  afterEach(() => rmSync(store, { recursive: true, force: true }));

  const snapshot = () =>
    ["relay", "ledger"].flatMap((d) => readdirSync(join(store, d)).map((n) => `${d}/${n}@${statSync(join(store, d, n)).mtimeMs}`)).sort();

  it("reads the ledger and the live windows, skips files that are not the mod's, and writes nothing", async () => {
    const live = win({ used: 2 });
    writeFileSync(join(store, "relay", `${live.key}.json`), JSON.stringify(live));
    writeFileSync(join(store, "relay", `${live.key}.set.json`), JSON.stringify({ limit: "3", at: NOW }));
    writeFileSync(join(store, "relay", "notes.json"), "{}");
    writeFileSync(join(store, "relay", ".retention-ran"), `${NOW} 1\n`);
    writeFileSync(join(store, "ledger", "2026-10.jsonl"), ledger(win({ updatedAt: OCT, used: 3 })));
    writeFileSync(join(store, "ledger", "notes.txt"), "not a ledger");
    const before = snapshot();
    const stats = await readRelayStats({ store });
    expect(row(stats, "2026-11", "repo-a")).toEqual({ windows: 1, sessions: 1, relays: 2 });
    expect(row(stats, "2026-10", "repo-a")).toEqual({ windows: 1, sessions: 1, relays: 3 });
    expect((await readRelayStats({ store, months: ["2026-11"] })).get("2026-10")).toBeUndefined();
    expect(snapshot()).toEqual(before);
  });

  it("is empty for a store with no relay or ledger folder", async () => {
    rmSync(join(store, "relay"), { recursive: true });
    rmSync(join(store, "ledger"), { recursive: true });
    expect((await readRelayStats({ store })).size).toBe(0);
  });
});
