// scripts/idle-cost.mjs: finds cold returns (a gap longer than the cache TTL between two
// replies) in Claude Code transcripts and prices them. The fixture has known gaps, so the
// counts and dollars are exact.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { scan, summarise, HANDOVER_SHARE } from "../scripts/idle-cost.mjs";

const root = mkdtempSync(join(tmpdir(), "idle-cost-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const MIN = 60_000;
const T0 = Date.parse("2026-10-01T00:00:00Z");
let n = 0;
// A main-thread reply whose context (input + cache read + cache creation) is `ctx` tokens.
const reply = (min, ctx, extra = {}, model = "claude-sonnet-5-5") =>
  JSON.stringify({
    type: "assistant",
    timestamp: new Date(T0 + min * MIN).toISOString(),
    message: { id: "msg_" + ++n, model, usage: { input_tokens: 10, cache_read_input_tokens: ctx - 10 - 5, cache_creation_input_tokens: 5 } },
    ...extra,
  });
const transcript = (name, lines) => {
  mkdirSync(root, { recursive: true });
  const file = join(root, name);
  writeFileSync(file, lines.join("\n") + "\n");
  return file;
};

describe("scan", () => {
  it("finds a gap longer than the TTL and the context of the reply before it", () => {
    const file = transcript("a.jsonl", [reply(0, 100_000), reply(30, 120_000), reply(120, 200_000)]);
    const r = scan([file], { ttlMin: 60 });
    expect(r.cold.map((c) => [c.gapMin, c.context])).toEqual([[90, 120_000]]);
  });

  it("prices that context at the 1h cache-write rate of the model (Sonnet 5.5 US$4/MTok, Opus 5.5 US$8/MTok)", () => {
    const sonnet = transcript("s.jsonl", [reply(0, 120_000), reply(90, 130_000)]);
    const opus = transcript("o.jsonl", [reply(0, 100_000, {}, "claude-opus-5-5"), reply(90, 100_000, {}, "claude-opus-5-5")]);
    expect(scan([sonnet, opus]).cold.map((c) => c.usd)).toEqual([0.48, 0.8]);
  });

  it("prices the other current ids at their own 1h write rate, longest id first (Opus 5.5 is not Opus 5)", () => {
    const rate = { "claude-opus-5-5": 8, "claude-opus-5": 10, "claude-opus-4-8": 10, "claude-sonnet-5": 4, "claude-fable-5": 20, "claude-fable-5-1": 20 };
    const files = Object.keys(rate).map((m, i) => transcript("r" + i + ".jsonl", [reply(0, 100_000, {}, m), reply(90, 100_000, {}, m)]));
    expect(scan(files).cold.map((c) => [c.model, c.usd])).toEqual(Object.entries(rate).map(([m, r]) => [m, (100_000 * r) / 1e6]));
  });

  it("prices Haiku 5.5 by prompt size: US$0.20/MTok up to 100k tokens, US$1/MTok above", () => {
    const m = "claude-haiku-5-5";
    const small = transcript("h1.jsonl", [reply(0, 100_000, {}, m), reply(90, 100_000, {}, m)]);
    const big = transcript("h2.jsonl", [reply(0, 100_001, {}, m), reply(90, 100_001, {}, m)]);
    expect(scan([small, big]).cold.map((c) => c.usd)).toEqual([0.02, 0.100001]);
  });

  it("treats exactly the TTL as warm, ignores subagent replies and counts a repeated message id once", () => {
    const dup = reply(0, 100_000);
    const file = transcript("e.jsonl", [
      dup,
      dup, // same id again: one reply
      reply(60, 110_000), // exactly 60 min: warm
      reply(100, 999_999, { isSidechain: true }), // subagent: not the main thread
      reply(121, 120_000), // 61 min after the 110k reply: cold at 110k, not 999,999
      "not json at all",
    ]);
    expect(scan([file]).cold.map((c) => [c.gapMin, c.context])).toEqual([[61, 110_000]]);
  });

  it("counts a gap on a model with no price as skipped and does not price it", () => {
    const file = transcript("m.jsonl", [reply(0, 50_000, {}, "claude-mystery-9"), reply(200, 60_000, {}, "claude-mystery-9")]);
    const r = scan([file]);
    expect([r.cold.length, r.skipped, r.skippedModels]).toEqual([0, 1, { "claude-mystery-9": 1 }]);
  });
});

describe("summarise", () => {
  // Two cold returns in October (120k and 210k Sonnet), one in November (100k Opus).
  const a = transcript("p1.jsonl", [reply(0, 120_000), reply(90, 210_000), reply(300, 220_000)]);
  const nov = (id, iso, tokens) => JSON.stringify({ type: "assistant", timestamp: iso, message: { id, model: "claude-opus-5-5", usage: { input_tokens: tokens } } });
  const b = transcript("p2.jsonl", [nov("n1", "2026-11-02T00:00:00Z", 100_000), nov("n2", "2026-11-02T03:00:00Z", 150_000)]);
  const { cold } = scan([a, b]);

  it("groups by UTC month: returns, cold cost, and the handover alternative at HANDOVER_SHARE of it", () => {
    const s = summarise(cold, "month");
    expect(s.map((p) => [p.period, p.returns])).toEqual([["2026-10", 2], ["2026-11", 1]]);
    expect(s[0].coldUsd).toBeCloseTo(0.48 + 0.84, 10);
    expect(s[0].handoverUsd).toBeCloseTo((0.48 + 0.84) * HANDOVER_SHARE, 10);
    expect(s[1].coldUsd).toBeCloseTo(0.8, 10);
  });
});

describe("command line", () => {
  const SCRIPT = join(import.meta.dirname, "../scripts/idle-cost.mjs");
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

  it("reads <dir>/<project>/*.jsonl and prints a row per month, the total and the caveats", () => {
    const dir = join(root, "projects");
    mkdirSync(join(dir, "proj"), { recursive: true });
    writeFileSync(join(dir, "proj", "x.jsonl"), [reply(0, 120_000), reply(90, 130_000)].join("\n") + "\n");
    const r = run("--dir", dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/2026-10\s+1\s+US\$0\.48\s+US\$0\.05/);
    expect(r.stdout).toMatch(/Total\s+1\s+US\$0\.48/);
    expect(r.stdout).toMatch(/measured at 390k only/);
    expect(r.stdout).toMatch(/API-equivalent/);
  });
});
