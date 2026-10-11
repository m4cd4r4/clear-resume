// Checks the results data file against the RESULTS.md tables (hard-coded here from that file) and,
// when the A/B folder is on this machine, re-extracts it from the transcripts and compares.
// Usage: node site/extract-results.test.mjs   (exits 1 on any FAIL)
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { extractAll, OUT_DIR, PREDICTIONS, FLOOR_PREDICTIONS, COST_BATCH } from "./extract-results.mjs";

const AB = "I:/Scratch/_ab";
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "  " + extra)); if (!ok) failed++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const data = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "results.json"), "utf8"));

// ---- the measured tables (measure-2026-10-11-sonnet.txt and -opus.txt, as printed) ---------------------
// [id, sessions, compactions, tokensM, costUsd, outputK, wallMin, PLAN.md ticked]
const SONNET = [
  ["relay", 5, 0, 31.2, 11.51, 244, 46.7, 30],
  ["relay-r2", 5, 0, 37.2, 12.58, 244, 52.9, 30],
  ["relay-r3", 4, 0, 36.9, 12.54, 257, 50.5, 30],
  ["relay-r4", 2, 0, 8.9, 2.48, 85, 17, 10],
  ["relay-r5", 5, 0, 42.7, 9.93, 259, 52.5, 30],
  ["relay-r6", 5, 0, 38.9, 9.13, 243, 50, 30],
  ["compact200", 1, 2, 14.7, 5.98, 157, 27.4, 20],
  ["compact200-r2", 1, 5, 38.9, 14.1, 261, 52.6, 30],
  ["compact200-r3", 1, 4, 32.9, 11.96, 231, 46.3, 30],
  ["compact200-r4", 1, 4, 37.5, 9.67, 273, 63.5, 30],
  ["compact200-r5", 1, 4, 31.8, 8.86, 247, 50.8, 30],
  ["compact200-r6", 1, 3, 35.3, 8.53, 227, 54.2, 30],
  ["compact", 1, 0, 49.8, 13.31, 193, 36.3, 30],
  ["compact-r2", 1, 0, 65.9, 10.27, 197, 44.6, 30],
  ["compact-r3", 1, 0, 64.8, 10.33, 212, 47.8, 30],
  ["relay-trim", 6, 0, 48.8, 16.27, 277, 61.4, 30],
  ["relay-trim-r2", 7, 0, 48.5, 16.91, 300, 68.6, 30],
  ["relay-trim-r3", 6, 0, 41.2, 14.11, 236, 58.4, 30],
  ["relay-old", 8, 0, 51.8, 18.32, 291, 61.9, 30],
  ["relay-old-r2", 6, 0, 56.6, 17.67, 249, 56.5, 30],
  ["relay-old-r3", 7, 0, 52.7, 17.67, 262, 60.5, 30],
];
const OPUS = [
  ["relay", 7, 0, 59.3, 28.35, 359, 86.4, 30],
  ["relay-r2", 7, 0, 54.1, 26.58, 346, 88.9, 30],
  ["relay-r3", 6, 0, 51.9, 24.87, 325, 75.3, 30],
  ["relay-r4", 7, 0, 55.2, 26.33, 343, 86.7, 30],
  ["compact200", 1, 5, 52.7, 24.47, 289, 82.2, 30],
  ["compact200-r2", 1, 5, 46, 22.8, 287, 70.9, 30],
  ["compact200-r3", 1, 6, 52.4, 25.39, 306, 79.9, 30],
  ["compact", 1, 0, 81.5, 29.06, 233, 54.3, 30],
];
const checkRows = (rows, prefix, label) => {
  for (const [arm, sessions, compactions, tokensM, costUsd, outputK, wallMin, ticked] of rows) {
    const r = data.runs[prefix + arm];
    const got = r && [r.sessions, r.compactions, r.tokensM, r.costUsd, r.outputK, r.wallMin, r.planTicked];
    check(label + " table: " + prefix + arm, r && same(got, [sessions, compactions, tokensM, costUsd, outputK, wallMin, ticked]), JSON.stringify(got));
  }
};
checkRows(SONNET, "", "Sonnet");
checkRows(OPUS, "opus-", "Opus");
check("compact200 has two compactions at 176.8k and 177.6k", same(data.runs.compact200.compactionEvents.map((c) => Math.round(c.pre / 100) / 10), [176.8, 177.6]));
check("compact200 stopped with 10 items open", data.runs.compact200.planTicked === 20 && !data.runs.compact200.finished);
check("relay-r4 stopped with 20 items open, after 2 sessions", data.runs["relay-r4"].planTicked === 10 && data.runs["relay-r4"].planOpen === 20 && data.runs["relay-r4"].sessions === 2);
check("every run carries its AWST date batch", Object.values(data.runs).every((r) => ["2026-10-07", "2026-10-08", "2026-10-10"].includes(r.batch)));
check("batches: relay run 1 is 7 Oct, run 2 and 3 are 8 Oct, runs 4 to 6 are 10 Oct",
  same(["relay", "relay-r2", "relay-r3", "relay-r4", "relay-r5", "relay-r6"].map((id) => data.runs[id].batch),
    ["2026-10-07", "2026-10-08", "2026-10-08", "2026-10-10", "2026-10-10", "2026-10-10"]));

// ---- groups (RESULTS.md, "Planned tests: results") ----------------------------------------------------
const G = data.groups, O = data.opusGroups;
check("Sonnet relay: 5 of 6 finished, mean 37.4M (n=5), range 31.2 to 42.7M, one stopped at item 10",
  same([G.relay.n, G.relay.finished, G.relay.meanTokensM, G.relay.minTokensM, G.relay.maxTokensM, G.relay.stopped, G.relay.stoppedItems], [6, 5, 37.4, 31.2, 42.7, ["relay-r4"], [10]]));
check("Sonnet auto-compaction: 5 of 6 finished, mean 35.3M (n=5), one stopped at item 20",
  same([G.autocompact.n, G.autocompact.finished, G.autocompact.meanTokensM, G.autocompact.stopped, G.autocompact.stoppedItems], [6, 5, 35.3, ["compact200"], [20]]));
check("Sonnet long session: n=3, mean 60.2M (49.8, 65.9, 64.8)", same([G.long.n, G.long.meanTokensM, G.long.minTokensM, G.long.maxTokensM], [3, 60.2, 49.8, 65.9]));
check("Sonnet: a session that never compacts used 1.6x the relay's tokens and 1.7x auto-compaction's", G.relay.vsLong === 1.6 && G.autocompact.vsLong === 1.7);
check("race opens on the median-token finished run of each arm", G.relay.medianRun === "relay-r2" && G.autocompact.medianRun === "compact200-r6");
check("Opus relay: 4 of 4 finished (the 7 Oct run and three 10 Oct runs), mean 55.1M", same([O.relay.n, O.relay.finished, O.relay.meanTokensM], [4, 4, 55.1]));
check("Opus auto-compaction: 3 of 3 finished, mean 50.4M", same([O.autocompact.n, O.autocompact.finished, O.autocompact.meanTokensM], [3, 3, 50.4]));
check("Opus never-compacting session: 81.5M (n=1), about 1.5x the relay", O.long.n === 1 && O.long.meanTokensM === 81.5 && O.relay.vsLong === 1.5);

// cost: inside the 2026-10-10 batch only
const K = data.cost;
check("cost is compared inside one batch: " + COST_BATCH, K.batch === COST_BATCH &&
  ["sonnet", "opus"].every((m) => ["relay", "autocompact", "long"].every((g) => K[m][g].runs.every((id) => data.runs[id].batch === COST_BATCH))));
check("Sonnet 10 Oct cost: relay US$9.53 (n=2 finished), auto-compaction US$9.02 (n=3), 6% apart",
  same([K.sonnet.relay.meanCostUsd, K.sonnet.relay.finished, K.sonnet.autocompact.meanCostUsd, K.sonnet.autocompact.finished, K.sonnet.gapPct], [9.53, 2, 9.02, 3, 6]));
check("Opus 10 Oct cost: relay US$25.93, auto-compaction US$24.22 (n=3 each), 7% apart, auto-compaction cheaper",
  same([K.opus.relay.meanCostUsd, K.opus.autocompact.meanCostUsd, K.opus.relay.finished, K.opus.autocompact.finished, K.opus.gapPct, K.opus.autoCheaper], [25.93, 24.22, 3, 3, 7, true]));

// cost at today's list price, every date (RESULTS.md, "All runs re-costed at today's list price")
const LC = data.listCost;
const cell = (g) => [g.meanUsd, g.medianUsd, g.finished];
check("list price, Sonnet: relay 9.08/8.94 (n=5), auto-compaction 9.19/8.87 (n=5), long 9.66/10.27 (n=3), long 6% over relay",
  same([...cell(LC.sonnet.relay), ...cell(LC.sonnet.autocompact), ...cell(LC.sonnet.long), LC.sonnet.longOverRelayPct], [9.08, 8.94, 5, 9.19, 8.87, 5, 9.66, 10.27, 3, 6]));
check("list price, Opus: relay 26.53 (n=4), auto-compaction 24.23 (n=3), long 29.06 (n=1)",
  same([LC.opus.relay.meanUsd, LC.opus.relay.finished, LC.opus.autocompact.meanUsd, LC.opus.autocompact.finished, LC.opus.long.meanUsd, LC.opus.long.finished], [26.53, 4, 24.23, 3, 29.06, 1]));
check("list price, stopped runs (not in the means): relay-r4 US$2.48, compact200 US$4.51",
  same([data.runs["relay-r4"].listUsd, data.runs.compact200.listUsd], [2.48, 4.51]));
// on CLI 2.1.296 (every 10 Oct run) the CLI already charged list price, so the two figures agree to US$0.02
const tenOct = Object.values(data.runs).filter((r) => r.batch === COST_BATCH);
check("10 Oct runs: list price within US$0.02 of the CLI's cost (" + tenOct.length + " runs)",
  tenOct.length > 0 && tenOct.every((r) => Math.abs(r.listUsd - r.costUsd) <= 0.02), tenOct.map((r) => r.id + " " + r.costUsd + "/" + r.listUsd).join(", "));

// starting-context comparison (2026-10-08, the three original relay runs)
const FLOOR = { relay: [22.1, 313, 4.7, 35.1, 31.2, 37.2, 12.21, 50], trim: [45.9, 379, 6.3, 46.2, 41.2, 48.8, 15.76, 62.8], old: [67.9, 394, 7, 53.7, 51.8, 56.6, 17.89, 59.6] };
for (const [g, want] of Object.entries(FLOOR)) {
  const f = data.floor[g];
  const got = [f.floorK, f.replies, f.sessions, f.tokensM, f.minTokensM, f.maxTokensM, f.costUsd, f.wallMin];
  check("floor table: " + g, same(got, want), JSON.stringify(got));
}
check("floor predictions quoted from RESULTS.md: 42.5M and 49.4M", data.floor.trim.prediction.predictedTokensM === 42.5 && data.floor.old.prediction.predictedTokensM === 49.4);

// idle handover (idle-results.json, idle2-results.json, idle3-results.json)
const I = data.idle, S = data.modelSwitch, L = I.latest;
check("idle: six cold returns, all US$1.56 with the whole 390,352 tokens rewritten",
  I.cold.length === 6 && I.cold.every((c) => c.costUsd === 1.56 && c.cacheRead === 0 && c.cacheWrite === 390352));
check("idle: 9 Oct cold returns at 65, 65 and 180 minutes; 10 Oct at 65 minutes each",
  same(I.cold.map((c) => [c.batch, c.idleMin]), [["2026-10-09", 65], ["2026-10-09", 65], ["2026-10-09", 180], ["2026-10-10", 65], ["2026-10-10", 65], ["2026-10-10", 65]]));
check("idle 10 Oct: handover then fresh read US$0.15, 0.15, 0.17 (RESULTS.md: 0.154, 0.152, 0.168), median US$0.15, n=3",
  same([I.warm.filter((w) => w.batch === L.batch).map((w) => w.totalUsd), L.warmMedianUsd, L.n], [[0.15, 0.15, 0.17], 0.15, 3]));
check("idle 10 Oct: cold US$1.56 median, 9.3 to 10.3 times the handover", L.coldMedianUsd === 1.56 && L.ratioMin === 9.3 && L.ratioMax === 10.3);
check("idle 9 Oct: handover US$0.20 + US$0.11 = US$0.30 (n=1), about 5x", I.earlier.n === 1 && I.earlier.warmUsd === 0.3 && I.warm[0].writeUsd === 0.2 && I.warm[0].freshStartUsd === 0.11 && I.earlier.ratio === 5.2);
check("idle protocol: 65 minutes idle, handover written at 55 minutes", L.idleMin === 65 && L.warmAtMin === 55);
check("switch: Opus cold US$3.13, handover US$0.24, about 13x", same([S.coldReturn.costUsd, S.warmHandover.totalUsd, S.ratio], [3.13, 0.24, 13]));

// predictions (written 2026-10-10 14:55 AWST, before the runs)
const P = data.predictions;
check("predictions: 8 rows, 5 inside, 3 outside", same([P.rows.length, P.inside, P.outside], [8, 5, 3]));
check("predictions: verdicts above, above, inside, inside, inside, below, inside, inside",
  same(P.rows.map((r) => r.verdict), ["above", "above", "inside", "inside", "inside", "below", "inside", "inside"]), JSON.stringify(P.rows.map((r) => r.verdict)));
check("P1 long-session tokens 65.9M and 64.8M against 45 to 55M", same([P.rows[0].measured, P.rows[0].band], [[65.9, 64.8], [45, 55]]));
check("P2 one relay run stopped early, no compaction run did", same([P.rows[1].measured, P.rows[2].measured], [[1], [0]]));
check("P3 warm handover below US$0.25 to 0.40; cold inside US$1.51 to 1.61", same([P.rows[5].band, P.rows[4].band], [[0.25, 0.4], [1.51, 1.61]]));
check("page text never says the relay finished 3 of 3 against 2 of 3", !/3 of 3|2 of 3/.test(fs.readFileSync(path.join(OUT_DIR, "..", "..", "index.html"), "utf8")));

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
// A measure file can hold several JSON objects back to back (measure-2026-10-08*.json) and print ratio lines after.
function parseObjects(text) {
  const out = {};
  let depth = 0, start = -1, inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === "\\") i++; else if (c === "\"") inStr = false; continue; }
    if (c === "\"") inStr = true;
    else if (c === "{") { if (depth++ === 0) start = i; }
    else if (c === "}" && --depth === 0) Object.assign(out, JSON.parse(text.slice(start, i + 1)));
  }
  return out;
}
const resultsMd = path.join(AB, "RESULTS.md");
if (fs.existsSync(resultsMd)) {
  const md = fs.readFileSync(resultsMd, "utf8").replace(/\s+/g, " ");
  for (const p of Object.values(FLOOR_PREDICTIONS)) check("RESULTS.md says \"" + p.source + "\"", md.includes(p.source));
  for (const p of PREDICTIONS) check("RESULTS.md says \"" + p.source + "\" (" + p.id + ")", md.includes(p.source));
  check("RESULTS.md predictions were drafted 2026-10-10 14:55 AWST, before P3 started at 15:16", md.includes("drafted 2026-10-10 14:55 AWST") && md.includes("P3 started 15:16 AWST"));
  const fresh = extractAll(AB);
  check("re-extracting from the transcripts gives the committed file", same(fresh, data));
  const MEASURES = [
    ["site-sonnet/measure-2026-10-08.json", ""], ["site-sonnet/measure-2026-10-08-floor.json", ""],
    ["measure-2026-10-11-sonnet.txt", ""], ["measure-2026-10-11-opus.txt", "opus-"],
  ];
  for (const [file, prefix] of MEASURES) {
    const f = path.join(AB, file);
    if (!fs.existsSync(f)) { console.log("SKIP  " + file + " not here"); continue; }
    for (const [arm, row] of Object.entries(parseObjects(fs.readFileSync(f, "utf8")))) {
      const r = data.runs[prefix + arm];
      if (!r) continue;
      check(file + " agrees: " + prefix + arm,
        same([r.sessions, r.replies, r.tokensM, r.costUsd, r.outputK, r.compactions, r.wallMin, r.planTicked],
          [row.sessions, row.replies, row.tokensM, row.costUsd, row.outputK, row.compactions, row.wallMin, row.planTicked]));
    }
  }
} else console.log("SKIP  " + AB + " not on this machine: transcript re-extraction not run");

console.log(failed ? failed + " failure(s)" : "ok   extract-results.test passed");
process.exit(failed ? 1 : 0);
