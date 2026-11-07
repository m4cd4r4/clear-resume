// Relay retention (docs/no-bloat/PROJECT-PLAN.md, wave 2): which relay window files
// are cornerman's, which are due, the ledger line, and the run's order and marker.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isDue, ledgerLine, ledgerMonth, pruneRelay, verdict, windowFrom } from "../../plugin/packages/store/relay-retention.mjs";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 7, 2, 0, 0);
const KEY = `${(NOW - 30 * DAY).toString(36)}-abc123`;
const file = (o = {}) => JSON.stringify({ v: 1, key: KEY, cwd: "/work/app", sessions: ["s1"], limit: 3, configured: 3, used: 1, stalled: 0, applied: 0, updatedAt: NOW - 20 * DAY, ...o });

describe("windowFrom", () => {
  it("takes only a file the relay mod wrote: its key shape, v 1, and the key it is named for", () => {
    expect(windowFrom(`${KEY}.json`, file())?.key).toBe(KEY);
    expect(windowFrom(`${KEY}.json`, file({ key: "other-abc" }))).toBeUndefined();
    expect(windowFrom(`${KEY}.json`, file({ v: 2 }))).toBeUndefined();
    expect(windowFrom("notes.json", JSON.stringify({ v: 1, key: "notes", updatedAt: 1, sessions: [] }))).toBeUndefined();
    expect(windowFrom(`${KEY}.set.json`, file())).toBeUndefined();
    expect(windowFrom(`${KEY}.json`, "{torn")).toBeUndefined();
  });
});

describe("verdict", () => {
  const w = JSON.parse(file());
  it("deletes a window idle 14 days by its own and its asks' timestamps, unless a live session is in it", () => {
    expect(verdict(w, { asks: [], live: new Set(), now: NOW })).toBe("due");
    expect(verdict({ ...w, updatedAt: NOW - 13 * DAY }, { asks: [], live: new Set(), now: NOW })).toBe("recent");
    expect(verdict(w, { asks: [NOW - 2 * DAY], live: new Set(), now: NOW })).toBe("recent");
    expect(verdict(w, { asks: [], live: new Set(["s1"]), now: NOW })).toBe("live");
  });
});

describe("ledgerLine", () => {
  it("records the repo, relays used and applied, when the window began and last changed, under the month it last changed", () => {
    const w = JSON.parse(file({ cwd: "C:\\work\\app-two", sessions: ["s1", "s2", "s3"], used: 2, applied: 123 }));
    expect(JSON.parse(ledgerLine(w, NOW))).toEqual({
      v: 1, kind: "relay", key: KEY, repo: "app-two", cwd: "C:\\work\\app-two", sessions: 3, used: 2, limit: 3, applied: 123,
      firstAt: NOW - 30 * DAY, lastAt: NOW - 20 * DAY, deletedAt: NOW,
    });
    expect(ledgerMonth(NOW - 20 * DAY)).toBe(`2026-${String(new Date(NOW - 20 * DAY).getMonth() + 1).padStart(2, "0")}`);
  });
});

describe("isDue", () => {
  it("runs with no marker, a bad one, one a day old, or one from the future; not within the day", () => {
    expect(isDue("", NOW)).toBe(true);
    expect(isDue("junk", NOW)).toBe(true);
    expect(isDue(`${NOW - DAY} 99`, NOW)).toBe(true);
    expect(isDue(`${NOW + 60_000} 99`, NOW)).toBe(true);
    expect(isDue(`${NOW - DAY + 60_000} 99`, NOW)).toBe(false);
  });
});

describe("pruneRelay", () => {
  let root, relay, sessions, ledger;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cr-retention-"));
    [relay, sessions, ledger] = ["relay", "sessions", "ledger"].map((d) => join(root, d));
    mkdirSync(relay);
    mkdirSync(sessions);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const put = (name, text) => writeFileSync(join(relay, name), text);
  const keyAt = (ms, tail) => `${ms.toString(36)}-${tail}`;
  const lines = () => readdirSync(ledger).flatMap((f) => readFileSync(join(ledger, f), "utf8").split("\n").filter(Boolean)).map((l) => JSON.parse(l));

  it("ledgers each due window, then deletes it with its asks, and leaves recent, live and foreign files alone", () => {
    const due = keyAt(NOW - 40 * DAY, "aaaaaa"), recent = keyAt(NOW - 40 * DAY, "bbbbbb"), live = keyAt(NOW - 40 * DAY, "cccccc");
    put(`${due}.json`, file({ key: due }));
    put(`${due}.set.json`, JSON.stringify({ limit: "3", at: NOW - 30 * DAY }));
    put(`${recent}.json`, file({ key: recent, updatedAt: NOW - DAY }));
    put(`${live}.json`, file({ key: live, sessions: ["s-live"] }));
    put("notes.json", JSON.stringify({ v: 1, updatedAt: 0, sessions: [] }));
    writeFileSync(join(sessions, "4242.json"), JSON.stringify({ pid: 4242, sessionId: "s-live" }));
    const r = pruneRelay({ relayDir: relay, sessionsDir: sessions, ledgerDir: ledger, now: NOW });
    expect(r).toMatchObject({ ledgered: 1, deleted: 1, failed: 0, live: 1, recent: 1 });
    expect(readdirSync(relay).sort()).toEqual([`${live}.json`, `${recent}.json`, "notes.json"].sort());
    expect(lines().map((l) => l.key)).toEqual([due]);
  });

  it("ledgers a window that cannot be deleted once, and deletes it on the next run without a second line", () => {
    const key = keyAt(NOW - 40 * DAY, "dddddd");
    put(`${key}.json`, file({ key }));
    const locked = (p) => {
      throw Object.assign(new Error(`EBUSY ${p}`), { code: "EBUSY" });
    };
    expect(pruneRelay({ relayDir: relay, sessionsDir: sessions, ledgerDir: ledger, now: NOW, remove: locked })).toMatchObject({ ledgered: 1, deleted: 0, failed: 1 });
    expect(pruneRelay({ relayDir: relay, sessionsDir: sessions, ledgerDir: ledger, now: NOW + DAY })).toMatchObject({ ledgered: 0, deleted: 1, failed: 0 });
    expect(lines().map((l) => l.key)).toEqual([key]);
    expect(readdirSync(relay)).toEqual([]);
  });

  it("keeps every whole line when a crash tore the ledger's last one, and writes the next line on its own", () => {
    const key = keyAt(NOW - 40 * DAY, "eeeeee");
    put(`${key}.json`, file({ key }));
    mkdirSync(ledger);
    const month = join(ledger, `${ledgerMonth(NOW - 20 * DAY)}.jsonl`);
    writeFileSync(month, `${JSON.stringify({ v: 1, kind: "relay", key: "earlier-aaaaaa", lastAt: 1 })}\n{"v":1,"kind":"rel`);
    expect(pruneRelay({ relayDir: relay, sessionsDir: sessions, ledgerDir: ledger, now: NOW })).toMatchObject({ ledgered: 1, deleted: 1 });
    expect(readFileSync(month, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l).key; } catch { return "torn"; } })).toEqual(["earlier-aaaaaa", "torn", key]);
  });
});
