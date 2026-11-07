// tdd-guard:allow (backfill: month-source.ts was written first, then checked against these)
// The sidebar's "This month" (docs/no-bloat/PROJECT-PLAN.md, wave 3): what the
// Handovers model carries, that the ledger is read only when it changed, and what a
// large store costs. Every store here is a temp folder made by the test.
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerLine } from "../plugin/packages/store/relay-retention.mjs";
import { ledgerMonth, readRelayStats, relayStats } from "../plugin/packages/store/relay-stats.mjs";
import { MonthSource } from "../extension/src/month-source.ts";
import { pageJson } from "../extension/src/sidebar-model.ts";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 20, 12, 0, 0).getTime();
let seq = 0;
const win = (o = {}) => {
  const updatedAt = o.updatedAt ?? NOW - DAY;
  return { v: 1, key: `${(updatedAt - DAY).toString(36)}-${(seq++).toString(36)}`, cwd: "/work/repo-a", sessions: ["s1"], limit: 15, configured: 15, used: 1, stalled: 0, applied: 0, ...o, updatedAt };
};

let store, ledgerDir;
beforeEach(() => {
  store = mkdtempSync(join(tmpdir(), "cr-month-"));
  ledgerDir = join(store, "ledger");
  mkdirSync(ledgerDir);
});
afterEach(() => rmSync(store, { recursive: true, force: true }));

describe("MonthSource", () => {
  it("counts this month's ledger file and the live windows together, a key in both once", async () => {
    const gone = win({ cwd: "/work/repo-b", used: 4 });
    const both = win({ used: 2 });
    writeFileSync(join(ledgerDir, `${ledgerMonth(NOW)}.jsonl`), [gone, both].map((w) => ledgerLine(w, NOW) + "\n").join(""));
    const live = [{ ...both, used: 3, sessions: ["s1", "s2", "s3"] }, { v: 1, key: "notes" }];
    const month = new MonthSource(() => ledgerDir, async () => live);
    expect(await month.section(NOW)).toEqual({ counts: "2 windows · 7 relays · 2 repos", top: [{ repo: "repo-b", relays: "4 relays" }, { repo: "repo-a", relays: "3 relays" }] });
  });

  it("reads the ledger once, again only after a change it was told of, and only when its size or mtime moved", async () => {
    const path = join(ledgerDir, `${ledgerMonth(NOW)}.jsonl`);
    writeFileSync(path, ledgerLine(win(), NOW) + "\n");
    const month = new MonthSource(() => ledgerDir, async () => []);
    await month.section(NOW);
    await month.section(NOW);
    expect(month.reads).toBe(1);
    month.changed();
    await month.section(NOW);
    expect(month.reads).toBe(1);
    appendFileSync(path, ledgerLine(win({ used: 5 }), NOW) + "\n");
    expect((await month.section(NOW))?.counts).toBe("1 window · 1 relay · 1 repo");
    month.changed();
    expect((await month.section(NOW))?.counts).toBe("2 windows · 6 relays · 1 repo");
    expect(month.reads).toBe(2);
  });

  it("counts again when one relay file changed, and not when none did", async () => {
    const files = [win({ used: 1 }), win({ used: 2 })];
    const month = new MonthSource(() => ledgerDir, async () => files);
    const first = await month.section(NOW);
    expect(await month.section(NOW)).toBe(first);
    files[1] = { ...files[1], used: 9 };
    expect((await month.section(NOW))?.counts).toBe("2 windows · 10 relays · 1 repo");
  });

  it("is undefined with no window this month, and the model then carries no month at all", async () => {
    const month = new MonthSource(() => join(store, "missing"), async () => [win({ updatedAt: new Date(2026, 9, 10).getTime() })]);
    const section = await month.section(NOW);
    expect(section).toBeUndefined();
    expect(pageJson({ section: "handovers", sections: [], month: section })).toBe('{"section":"handovers","sections":[]}');
  });
});

// Not a pass/fail gate on speed: the numbers go in the PR. The bound only catches a
// slip by an order of magnitude.
describe("cost on a large store", () => {
  it("aggregates 2,000 live windows and 12 months of 1,500 ledger lines", async () => {
    const repos = Array.from({ length: 40 }, (_, i) => `/work/repo-${i}`);
    const relayDir = join(store, "relay");
    mkdirSync(relayDir);
    const live = [];
    for (let i = 0; i < 2000; i++) {
      const w = win({ cwd: repos[i % repos.length], sessions: ["a", "b", "c"].slice(0, 1 + (i % 3)), used: i % 7, updatedAt: NOW - (i % 40) * DAY });
      live.push(w);
      writeFileSync(join(relayDir, `${w.key}.json`), JSON.stringify(w));
    }
    for (let m = 0; m < 12; m++) {
      const at = new Date(2026, 10 - m, 10, 12).getTime();
      const lines = Array.from({ length: 1500 }, (_, i) => ledgerLine(win({ cwd: repos[i % repos.length], used: i % 5, updatedAt: at + (i % 9) * 3_600_000 }), NOW) + "\n");
      writeFileSync(join(ledgerDir, `${ledgerMonth(at)}.jsonl`), lines.join(""));
    }
    const time = async (fn) => {
      const t = performance.now();
      const out = await fn();
      return [out, performance.now() - t];
    };
    const [all, full] = await time(() => readRelayStats({ store }));
    expect(all.size).toBeGreaterThanOrEqual(12);
    // The counting alone, with every file already in memory.
    const texts = readdirSync(ledgerDir).map((n) => readFileSync(join(ledgerDir, n), "utf8"));
    const [, counting] = await time(() => relayStats({ ledgers: texts, live }));
    const [, twoMonths] = await time(() => readRelayStats({ store, months: [ledgerMonth(NOW), "2026-10"] }));
    const month = new MonthSource(() => ledgerDir, async () => live);
    const [section, cold] = await time(() => month.section(NOW));
    // A relay file changed: same count of files, one new object.
    const changed = [...live];
    const moved = new MonthSource(() => ledgerDir, async () => changed);
    await moved.section(NOW);
    changed[0] = { ...changed[0], used: 6 };
    const [, recount] = await time(() => moved.section(NOW));
    const runs = [];
    for (let i = 0; i < 20; i++) runs.push((await time(() => month.section(NOW)))[1]);
    runs.sort((a, b) => a - b);
    const warm = runs[10];
    const base = pageJson({ section: "handovers", query: "", hasLegacy: false, sections: [] });
    const bytes = Buffer.byteLength(pageJson({ section: "handovers", query: "", hasLegacy: false, sections: [], month: section })) - Buffer.byteLength(base);
    console.log(
      `relay stats cost: /cornerman:stats as run (2 ledger months + 2,000 live files read) ${twoMonths.toFixed(1)} ms; whole store read ${full.toFixed(1)} ms; ` +
        `counting alone (18,000 lines + 2,000 windows in memory) ${counting.toFixed(1)} ms; sidebar section cold ${cold.toFixed(1)} ms, ` +
        `one relay file changed ${recount.toFixed(2)} ms, unchanged median ${warm.toFixed(3)} ms; +${bytes} bytes per post (${section.top.length} repos named)`,
    );
    expect(full).toBeLessThan(5_000);
    expect(warm).toBeLessThan(500);
    expect(bytes).toBeLessThan(400);
  });
});
