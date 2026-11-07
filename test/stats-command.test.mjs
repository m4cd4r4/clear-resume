// tdd-guard:allow (backfill: plugin/scripts/stats.mjs was written first, then checked against these)
// /cornerman:stats as the skill runs it: plugin/scripts/stats.mjs against a store in a temp folder.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ledgerMonth } from "../plugin/packages/store/relay-retention.mjs";
import { monthName, previousMonth } from "../plugin/packages/store/relay-stats.mjs";

const SCRIPT = resolve(import.meta.dirname, "..", "plugin", "scripts", "stats.mjs");

let store;
beforeEach(() => {
  store = mkdtempSync(join(tmpdir(), "cr-stats-cmd-"));
});
afterEach(() => rmSync(store, { recursive: true, force: true }));

const run = () => spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", env: { ...process.env, CORNERMAN_HOME: store, CLEAR_RESUME_HOME: "" } });

describe("stats.mjs", () => {
  it("prints this month's table from the live files and last month's line from the ledger", () => {
    const now = Date.now();
    const key = `${(now - 60_000).toString(36)}-abc`;
    mkdirSync(join(store, "relay"));
    writeFileSync(join(store, "relay", `${key}.json`), JSON.stringify({ v: 1, key, cwd: "/work/repo-a", sessions: ["s1", "s2", "s3"], used: 4, applied: now, updatedAt: now }));
    const prev = previousMonth(ledgerMonth(now));
    const [y, m] = prev.split("-").map(Number);
    const lastAt = new Date(y, m - 1, 15, 12).getTime();
    mkdirSync(join(store, "ledger"));
    const line = { v: 1, kind: "relay", key: `${(lastAt - 1).toString(36)}-def`, repo: "repo-b", cwd: "/work/repo-b", sessions: 1, used: 2, limit: 3, applied: lastAt, firstAt: lastAt - 1, lastAt, deletedAt: now };
    writeFileSync(join(store, "ledger", `${prev}.jsonl`), JSON.stringify(line) + "\n");
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(
      [
        `cornerman stats, ${monthName(ledgerMonth(now))}`,
        "",
        "repo     windows  sessions  relays",
        "repo-a         1         3       4",
        "total          1         3       4",
        "",
        `${monthName(prev)}: 1 window, 2 relays`,
        "",
      ].join("\n"),
    );
  });

  it("says there is nothing yet for an empty store", () => {
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("cornerman stats: no relay windows yet.\n");
  });
});
