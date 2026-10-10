// Checks the results data file against the RESULTS.md tables (hard-coded here from that file) and,
// when the A/B folder is on this machine, re-extracts it from the transcripts and compares.
// Usage: node site/extract-results.test.mjs   (exits 1 on any FAIL)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { extractAll, OUT_DIR, PREDICTIONS } from "./extract-results.mjs";

const AB = "I:/Scratch/_ab";
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "  " + extra)); if (!ok) failed++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const data = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "results.json"), "utf8"));

// ---- the RESULTS.md tables ---------------------------------------------------------------------
// [arm, sessions, compactions, tokensM, costUsd, outputK, wallMin, PLAN.md ticked]
const TABLE = [
  ["relay", 5, 0, 31.2, 11.51, 244, 46.7, 30],
  ["relay-r2", 5, 0, 37.2, 12.58, 244, 52.9, 30],
  ["relay-r3", 4, 0, 36.9, 12.54, 257, 50.5, 30],
  ["compact200", 1, 2, 14.7, 5.98, 157, 27.4, 20],
  ["compact200-r2", 1, 5, 38.9, 14.10, 261, 52.6, 30],
  ["compact200-r3", 1, 4, 32.9, 11.96, 231, 46.3, 30],
  ["compact", 1, 0, 49.8, 13.31, 193, 36.3, 30],
];
for (const [arm, sessions, compactions, tokensM, costUsd, outputK, wallMin, ticked] of TABLE) {
  const r = data.runs[arm];
  const got = r && [r.sessions, r.compactions, r.tokensM, r.costUsd, r.outputK, r.wallMin, r.planTicked];
  check("RESULTS.md n=3 table: " + arm, r && same(got, [sessions, compactions, tokensM, costUsd, outputK, wallMin, ticked]), JSON.stringify(got));
}
check("compact200 has two compactions at 176.8k and 177.6k", same(data.runs.compact200.compactionEvents.map((c) => Math.round(c.pre / 100) / 10), [176.8, 177.6]));
check("compact200 stopped with 10 items open", data.runs.compact200.planTicked === 20 && !data.runs.compact200.finished);

const G = data.groups;
check("relay: 3 of 3 finished, mean 35.1M, US$12.21, 50.0 min, 313 replies, 4.7 sessions",
  same([G.relay.finished, G.relay.meanTokensM, G.relay.meanCostUsd, G.relay.meanWallMin, G.relay.meanReplies, G.relay.meanSessions], [3, 35.1, 12.21, 50, 313, 4.7]));
check("auto-compaction: 2 of 3 finished, mean 35.9M, US$13.03, 49.5 min",
  same([G.autocompact.finished, G.autocompact.meanTokensM, G.autocompact.meanCostUsd, G.autocompact.meanWallMin], [2, 35.9, 13.03, 49.5]));
check("relay range 31.2 to 37.2M", G.relay.minTokensM === 31.2 && G.relay.maxTokensM === 37.2);
check("both clearing methods about 1.4x fewer tokens than the long session", G.relay.vsLong === 1.4 && G.autocompact.vsLong === 1.4);

// floor table: arm group -> [floorK, replies, sessions, tokensM, min, max, costUsd, wallMin]
const FLOOR = { relay: [22.1, 313, 4.7, 35.1, 31.2, 37.2, 12.21, 50], trim: [45.9, 379, 6.3, 46.2, 41.2, 48.8, 15.76, 62.8], old: [67.9, 394, 7, 53.7, 51.8, 56.6, 17.89, 59.6] };
for (const [g, want] of Object.entries(FLOOR)) {
  const f = data.floor[g];
  const got = [f.floorK, f.replies, f.sessions, f.tokensM, f.minTokensM, f.maxTokensM, f.costUsd, f.wallMin];
  check("RESULTS.md floor table: " + g, same(got, want), JSON.stringify(got));
}
check("floor predictions quoted from RESULTS.md: 42.5M and 49.4M", data.floor.trim.prediction.predictedTokensM === 42.5 && data.floor.old.prediction.predictedTokensM === 49.4);

const I = data.idle, S = data.modelSwitch;
check("idle: cold return US$1.56 after 65 min and after 180 min", I.coldReturns.filter((c) => c.idleMin).every((c) => c.costUsd === 1.56 && c.cacheRead === 0));
check("idle: warm handover US$0.20 + US$0.11 = US$0.30, about 5x", same([I.warmHandover.writeUsd, I.warmHandover.freshStartUsd, I.warmHandover.totalUsd, I.ratio], [0.2, 0.11, 0.3, 5.2]));
check("switch: Opus cold US$3.13, handover US$0.24, about 13x", same([S.coldReturn.costUsd, S.warmHandover.totalUsd, S.ratio], [3.13, 0.24, 13]));

// ---- shape ----------------------------------------------------------------------------------------
for (const r of Object.values(data.runs)) {
  const bad = [];
  if (r.series) {
    const { t, ctx, calls } = r.series;
    if (!(t.length === r.replies && ctx.length === r.replies && calls.length === r.replies)) bad.push("series length");
    if (t.some((v, i) => i && v < t[i - 1])) bad.push("t not sorted");
    if (calls[calls.length - 1] !== r.toolCalls) bad.push("calls total");
    if (ctx.reduce((a, b) => a + b, 0) !== r.tokens) bad.push("ctx sum");
  }
  if (r.items.length !== r.planTicked) bad.push("git items " + r.items.length + " vs PLAN.md " + r.planTicked);
  if (r.compactionEvents.length !== r.compactions) bad.push("compactions");
  if (r.clearsAt.length !== r.clears) bad.push("clears");
  check("shape: " + r.id, !bad.length, bad.join(", "));
}

// ---- results.js is the same object ----------------------------------------------------------------
const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(OUT_DIR, "results.js"), "utf8"), ctx);
check("results.js holds the same object as results.json", same(ctx.crResults, data));

// ---- against the machine's A/B folder, when it is here ------------------------------------------------
const resultsMd = path.join(AB, "RESULTS.md");
if (fs.existsSync(resultsMd)) {
  const md = fs.readFileSync(resultsMd, "utf8").replace(/\s+/g, " ");
  for (const p of Object.values(PREDICTIONS)) check("RESULTS.md says \"" + p.source + "\"", md.includes(p.source));
  const fresh = extractAll(AB);
  check("re-extracting from the transcripts gives the committed file", same(fresh, data));
  // measure.mjs prints ratio lines after the JSON
  const raw = fs.readFileSync(path.join(AB, "site-sonnet", "measure-2026-10-08.json"), "utf8");
  const m = JSON.parse(raw.slice(0, raw.lastIndexOf("\n}") + 2));
  for (const [arm, row] of Object.entries(m)) {
    const r = data.runs[arm];
    if (!r) continue;
    check("measure-2026-10-08.json agrees: " + arm,
      same([r.sessions, r.replies, r.tokensM, r.costUsd, r.outputK, r.compactions, r.wallMin, r.planTicked],
        [row.sessions, row.replies, row.tokensM, row.costUsd, row.outputK, row.compactions, row.wallMin, row.planTicked]));
  }
} else console.log("SKIP  " + AB + " not on this machine: transcript re-extraction not run");

console.log(failed ? failed + " failure(s)" : "ok   extract-results.test passed");
process.exit(failed ? 1 : 0);
