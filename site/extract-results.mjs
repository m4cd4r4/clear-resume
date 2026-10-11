// extract-results.mjs: reads the A/B transcripts and raw results and writes the ONE data file
// behind the results page and the results video.
// Usage: node site/extract-results.mjs [--ab I:/Scratch/_ab]
// Writes site/media/results/results.json and results.js (the same object as `var crResults = ...;`, so the
// page works from disk). Every figure is computed here from transcripts, stream.jsonl, git logs and the raw
// idle/switch result files. Nothing is typed in except the predictions, which are quoted from RESULTS.md
// (site/extract-results.test.mjs checks each quote against that file).
// Token method (same as site/buildstats.mjs measure()): dedupe assistant messages by id, then sum
// input + cache read + cache creation tokens of each reply.
// Cost: the CLI priced the 2026-10-10 runs lower per token than the 2026-10-07/08 runs (cache reads cheaper,
// cache writes unchanged), so a run carries its date batch and cost is only ever compared inside one batch.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SITE = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.join(SITE, "media", "results");

// Sonnet arms live in <ab>/site-sonnet/<arm>; Opus arms in <ab>/<arm>, and their ids get an "opus-" prefix.
// id -> group. The groups are the findings' arms.
const SONNET = {
  relay: "relay", "relay-r2": "relay", "relay-r3": "relay", "relay-r4": "relay", "relay-r5": "relay", "relay-r6": "relay",
  compact200: "autocompact", "compact200-r2": "autocompact", "compact200-r3": "autocompact",
  "compact200-r4": "autocompact", "compact200-r5": "autocompact", "compact200-r6": "autocompact",
  compact: "long", "compact-r2": "long", "compact-r3": "long",
  "relay-trim": "trim", "relay-trim-r2": "trim", "relay-trim-r3": "trim",
  "relay-old": "old", "relay-old-r2": "old", "relay-old-r3": "old",
};
const OPUS = {
  relay: "relay", "relay-r2": "relay", "relay-r3": "relay", "relay-r4": "relay",
  compact200: "autocompact", "compact200-r2": "autocompact", "compact200-r3": "autocompact",
  compact: "long",
};
export const SPECS = [
  ...Object.entries(SONNET).map(([arm, group]) => ({ id: arm, arm, group, model: "sonnet" })),
  ...Object.entries(OPUS).map(([arm, group]) => ({ id: "opus-" + arm, arm, group, model: "opus" })),
];
// The starting-context comparison ran on 2026-10-08 with the three original relay runs; the later relay runs
// used a newer plugin build and are not part of it.
const FLOOR_RUNS = {
  relay: ["relay", "relay-r2", "relay-r3"],
  trim: ["relay-trim", "relay-trim-r2", "relay-trim-r3"],
  old: ["relay-old", "relay-old-r2", "relay-old-r3"],
};
// Cost is only compared inside one batch: the CLI priced the 2026-10-10 runs lower per token (RESULTS.md).
export const COST_BATCH = "2026-10-10";
// Floor runs carry totals only: their per-reply series is not needed by any finding. The race reads Sonnet relay and compaction.
const SERIES_GROUPS = new Set(["relay", "autocompact"]);
const PLAN_ITEMS = 30;

const readJsonl = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const r0 = (n) => Math.round(n);
const AWST_MS = 8 * 3600 * 1000;
const awstDay = (ms) => new Date(ms + AWST_MS).toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateLabel = (iso) => Number(iso.slice(8, 10)) + " " + MONTHS[Number(iso.slice(5, 7)) - 1]; // "2026-10-09" -> "9 Oct"

function transcriptFiles(root) {
  const proj = path.join(root, "home", ".claude", "projects");
  const files = [];
  for (const d of fs.readdirSync(proj)) {
    const dir = path.join(proj, d);
    for (const f of fs.readdirSync(dir, { recursive: true })) if (String(f).endsWith(".jsonl")) files.push(path.join(dir, String(f)));
  }
  return files;
}

// One transcript file -> its replies (deduped by message id), compactions and tool calls.
function readSession(file) {
  const seen = new Set();
  const toolSeen = new Set();
  const replies = [];
  const compactions = [];
  const texts = [];
  for (const r of readJsonl(file)) {
    if (r.type === "system" && r.subtype === "compact_boundary") {
      const m = r.compactMetadata || {};
      compactions.push({ ts: Date.parse(r.timestamp), pre: m.preTokens ?? null, post: m.postTokens ?? null });
    }
    if (r.type !== "assistant" || !r.message) continue;
    const u = r.message.usage;
    const content = Array.isArray(r.message.content) ? r.message.content : [];
    let reply = null;
    if (u && r.message.id && !seen.has(r.message.id)) {
      seen.add(r.message.id);
      reply = { ts: Date.parse(r.timestamp), ctx: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
        out: u.output_tokens || 0, calls: 0 };
      replies.push(reply);
    }
    for (const c of content) {
      if (c.type === "text") texts.push(c.text);
      if (c.type === "tool_use" && !toolSeen.has(c.id)) {
        toolSeen.add(c.id);
        // a tool call belongs to the reply that made it (records of one message share its id)
        (reply || replies[replies.length - 1] || { calls: 0 }).calls++;
      }
    }
  }
  const smoke = replies.length === 1 && texts.join("").trim() === "OK";
  return { replies, compactions, smoke };
}

// PLAN.md items the agent committed ("site: N." and "final: 30."). An item is done at its LAST commit
// (item 28 has several self-review commits). Returns [[minutes since start, items done so far]].
function planItems(repo, startMs) {
  const log = execFileSync("git", ["-C", repo, "log", "--format=%cI%x09%s"], { encoding: "utf8", maxBuffer: 1 << 26 });
  const last = new Map();
  for (const line of log.split("\n").filter(Boolean)) {
    const [iso, subject] = line.split("\t");
    const m = subject.match(/^(?:site|final): (\d+)[a-z]?\./); // "28a." counts; "21 (wip, not ticked)." does not
    const t = Date.parse(iso);
    if (!m || t < startMs) continue;
    const n = Number(m[1]);
    if (!last.has(n) || t > last.get(n)) last.set(n, t);
  }
  const ticks = [...last.values()].sort((a, b) => a - b);
  return ticks.map((t, i) => [r2((t - startMs) / 60000), i + 1]);
}

// Ticked boxes in the arm's PLAN.md: the completion signal RESULTS.md uses (the agent's own done token is not reliable).
function planTicked(repo) {
  const f = [path.join(repo, "site", "PLAN.md"), path.join(repo, "PROGRESS.md")].find(fs.existsSync);
  return f ? (fs.readFileSync(f, "utf8").match(/^\s*[-*] \[x\]/gim) || []).length : 0;
}

// Anthropic list price, US$/MTok (platform.claude.com pricing, fetched 2026-10-11): input, 1h cache write, cache read, output.
// Claude Code on a subscription writes the 1h cache. CLI 2.1.296 (10 Oct) prices Sonnet 5.5 the same; 2.1.291 (7-9 Oct)
// still charged Sonnet 5.5 cache reads at the old 0.1x of input (RESULTS.md, "Cache-read price: which table is current").
export const LIST_PRICE = {
  fetched: "2026-10-11",
  "claude-sonnet-5-5": [2, 4, 0.10, 10],
  "claude-opus-5-5": [4, 8, 0.20, 20],
  "claude-haiku-4-5": [1, 2, 0.10, 5],
};
const listPriceFor = (m) => LIST_PRICE[Object.keys(LIST_PRICE).find((k) => k.startsWith("claude-") && m.startsWith(k))];

// cost: what the CLI charged. list: the same tokens (per model, from each result line's modelUsage) at LIST_PRICE.
function streamTotals(file) {
  let cost = 0, list = 0, results = 0;
  for (const r of readJsonl(file)) {
    if (r.type !== "result") continue;
    results++;
    cost += r.total_cost_usd || 0;
    for (const [m, u] of Object.entries(r.modelUsage || {})) {
      const p = listPriceFor(m);
      if (!p) throw new Error(file + ": no list price for " + m);
      list += ((u.inputTokens || 0) * p[0] + (u.cacheCreationInputTokens || 0) * p[1] + (u.cacheReadInputTokens || 0) * p[2] + (u.outputTokens || 0) * p[3]) / 1e6;
    }
  }
  return { cost, list, results };
}

export function extractRun(ab, spec) {
  const { id, arm, group, model } = spec;
  const root = model === "opus" ? path.join(ab, arm) : path.join(ab, "site-sonnet", arm);
  const startedIso = fs.readFileSync(path.join(root, "out", "started.txt"), "utf8").trim();
  const ended = fs.readFileSync(path.join(root, "out", "ended.txt"), "utf8").trim().split(" ")[0];
  const startMs = Date.parse(startedIso);
  const sessions = transcriptFiles(root).map(readSession).filter((s) => s.replies.length && !s.smoke);
  sessions.forEach((s) => { s.t0 = s.replies[0].ts; });
  sessions.sort((a, b) => a.t0 - b.t0);
  const all = sessions.flatMap((s) => s.replies).sort((a, b) => a.ts - b.ts);
  const tokens = all.reduce((n, x) => n + x.ctx, 0);
  const t = (ms) => r2((ms - startMs) / 60000);
  const totals = streamTotals(path.join(root, "out", "stream.jsonl"));
  const items = planItems(path.join(root, "cr-e2e"), startMs);
  const compactions = sessions.flatMap((s) => s.compactions).sort((a, b) => a.ts - b.ts).map((c) => ({ t: t(c.ts), pre: c.pre, post: c.post }));
  let calls = 0;
  const run = {
    id,
    model,
    modelName: model === "opus" ? "Opus 5.5" : "Sonnet 5.5",
    group,
    started: startedIso,
    batch: awstDay(startMs), // the AWST date the run started: 2026-10-07, 2026-10-08 or 2026-10-10
    sessions: sessions.length,
    clears: sessions.length - 1,
    compactions: compactions.length,
    replies: all.length,
    toolCalls: all.reduce((n, x) => n + x.calls, 0),
    tokens,
    tokensM: r1(tokens / 1e6),
    costUsd: r2(totals.cost),
    costExact: totals.cost,
    listUsd: r2(totals.list), // API-equivalent at today's list price, comparable across dates
    outputK: Math.round(all.reduce((n, x) => n + x.out, 0) / 1e3),
    wallMin: r1((Date.parse(ended) - startMs) / 60000),
    peakContext: Math.max(...all.map((x) => x.ctx)),
    run: Number((arm.match(/-r(\d+)$/) || [0, 1])[1]), // relay is run 1, relay-r2 is run 2
    planTicked: planTicked(path.join(root, "cr-e2e")),
    planTotal: PLAN_ITEMS,
    planOpen: PLAN_ITEMS - planTicked(path.join(root, "cr-e2e")),
    endT: t(all[all.length - 1].ts),
    clearsAt: sessions.slice(1).map((s) => t(s.t0)),
    compactionEvents: compactions,
    items,
    series: null,
  };
  run.finished = run.planTicked === PLAN_ITEMS;
  if (model === "sonnet" && SERIES_GROUPS.has(group)) {
    run.series = { t: all.map((x) => t(x.ts)), ctx: all.map((x) => x.ctx), calls: all.map((x) => (calls += x.calls)) };
  }
  return run;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function groupStats(runs) {
  const done = runs.filter((r) => r.finished);
  const over = (key) => ({ mean: mean(done.map((r) => r[key])), min: Math.min(...done.map((r) => r[key])), max: Math.max(...done.map((r) => r[key])) });
  // RESULTS.md averages the per-run cells as printed (cost to the cent, wall to 0.1 min), so cost and wall do the same.
  const tok = over("tokens"), cost = over("costUsd"), wall = over("wallMin"), rep = over("replies"), ses = over("sessions");
  const medTokens = median(done.map((r) => r.tokens));
  // the run whose token total is the median of the finished runs (the race opens on it; with an even count, the lower middle one)
  const byTokens = [...done].sort((a, b) => a.tokens - b.tokens);
  return {
    n: runs.length,
    finished: done.length,
    runs: runs.map((r) => r.id),
    stopped: runs.filter((r) => !r.finished).map((r) => r.id),
    stoppedItems: runs.filter((r) => !r.finished).map((r) => r.planTicked), // PLAN items done when each stopped run ended
    // means are over the runs that finished all 30 items; an unfinished run did a fraction of the work
    meanTokensM: r1(tok.mean / 1e6), minTokensM: r1(tok.min / 1e6), maxTokensM: r1(tok.max / 1e6),
    meanCostUsd: r2(cost.mean), meanWallMin: r1(wall.mean),
    meanReplies: Math.round(rep.mean), meanSessions: r1(ses.mean),
    // the page marks the median of the runs that finished, the figure no single best run can move
    medianTokensM: r1(medTokens / 1e6), medianCostUsd: r2(median(done.map((r) => r.costUsd))), medianWallMin: r1(median(done.map((r) => r.wallMin))),
    medianRun: byTokens[(byTokens.length - 1) >> 1].id,
  };
}

// Cost inside one date batch. Finished runs only for mean and range; a stopped run is still listed.
function batchCost(runs, batch) {
  const inBatch = runs.filter((r) => r.batch === batch);
  const done = inBatch.filter((r) => r.finished);
  if (!inBatch.length) return { batch, n: 0, finished: 0, runs: [] };
  return {
    batch,
    n: inBatch.length,
    finished: done.length,
    runs: inBatch.map((r) => r.id),
    meanCostUsd: done.length ? r2(mean(done.map((r) => r.costUsd))) : null,
    minCostUsd: done.length ? Math.min(...done.map((r) => r.costUsd)) : null,
    maxCostUsd: done.length ? Math.max(...done.map((r) => r.costUsd)) : null,
  };
}

// The predictions were written before the 2026-10-10 runs (RESULTS.md, "Planned tests: predictions written
// BEFORE the runs", drafted 2026-10-10 14:55 AWST; the first test started 15:16 AWST). Quoted, not recomputed:
// `source` is a verbatim piece of that table (extract-results.test.mjs checks it).
export const PREDICTIONS_WRITTEN = "2026-10-10 14:55 AWST";
export const PREDICTIONS = [
  { id: "P1", key: "longTokens", label: "Long session, tokens per run", unit: "M", cls: "c-long", band: [45, 55], source: "45-55M tokens each" },
  { id: "P2", key: "relayStops", label: "Relay stops, of 3 new runs", unit: "count", cls: "c-relay", band: [0, 0], source: "relay finishes 6 of 6; compaction stops early in 0-2 of the 3 new runs" },
  { id: "P2", key: "autoStops", label: "Compaction stops, of 3 new runs", unit: "count", cls: "c-auto", band: [0, 2], source: "compaction stops early in 0-2 of the 3 new runs" },
  { id: "P2", key: "sonnetCostGap", label: "Cost gap between arms, Sonnet", unit: "pct", cls: "c-neutral", band: [0, 10], source: "completed-run cost within 10% between arms" },
  { id: "P3", key: "coldCost", label: "Cold return, cost", unit: "usd", cls: "c-long", band: [1.51, 1.61], source: "cold differing from US$1.56 by more than US$0.05" },
  { id: "P3", key: "warmCost", label: "Handover then read, cost", unit: "usd", cls: "c-relay", band: [0.25, 0.4], source: "Warm: US$0.25-0.40 total" },
  { id: "P4", key: "opusRelayStops", label: "Opus relay stops, of 3 runs", unit: "count", cls: "c-relay", band: [0, 0], source: "relay 3 of 3; cost tie within 10%" },
  { id: "P4", key: "opusCostGap", label: "Cost gap between arms, Opus", unit: "pct", cls: "c-neutral", band: [0, 10], source: "cost tie within 10%" },
];
const AXES = {
  M: { lo: 40, hi: 70, ticks: [40, 50, 60, 70] },
  count: { lo: 0, hi: 3, ticks: [0, 1, 2, 3] },
  pct: { lo: 0, hi: 20, ticks: [0, 5, 10, 15, 20] },
  usd: null, // per row below
};
const USD_AXES = { coldCost: { lo: 1.4, hi: 1.7, ticks: [1.4, 1.5, 1.6, 1.7] }, warmCost: { lo: 0, hi: 0.5, ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5] } };

function predictionRows(runs, idle, cost) {
  const R = (id) => runs[id];
  const stops = (ids) => ids.filter((id) => !R(id).finished).length;
  const measured = {
    longTokens: ["compact-r2", "compact-r3"].map((id) => R(id).tokensM),
    relayStops: [stops(["relay-r4", "relay-r5", "relay-r6"])],
    autoStops: [stops(["compact200-r4", "compact200-r5", "compact200-r6"])],
    sonnetCostGap: [cost.sonnet.gapPct],
    coldCost: idle.latest.coldUsd,
    warmCost: idle.latest.warmUsd,
    opusRelayStops: [stops(["opus-relay-r2", "opus-relay-r3", "opus-relay-r4"])],
    opusCostGap: [cost.opus.gapPct],
  };
  const rows = PREDICTIONS.map((p) => {
    const axis = AXES[p.unit] || USD_AXES[p.key];
    const m = measured[p.key];
    const below = m.some((v) => v < p.band[0]), above = m.some((v) => v > p.band[1]);
    return { ...p, ...axis, measured: m, n: m.length, verdict: below ? "below" : above ? "above" : "inside" };
  });
  const inside = rows.filter((r) => r.verdict === "inside").length;
  const [day, time] = PREDICTIONS_WRITTEN.split(" ");
  return { writtenAt: PREDICTIONS_WRITTEN, writtenTime: time, dateLabel: dateLabel(day), total: rows.length, inside, outside: rows.length - inside, rows };
}

export const FLOORS = { relay: 22.1, trim: 45.9, old: 67.9 }; // measured smoke-reply floors, k tokens (RESULTS.md)
// The earlier floor predictions (RESULTS.md, 2026-10-08 12:30 AWST); quoted, not recomputed.
export const FLOOR_PREDICTIONS = {
  trim: { predictedTokensM: 42.5, source: "about 42.5M (vs 35.1M, +21%)", writtenAt: "2026-10-08 12:30 AWST" },
  old: { predictedTokensM: 49.4, source: "about 49.4M (+41%)", writtenAt: "2026-10-08 12:30 AWST" },
};

function idleAndSwitch(ab, baseCost) {
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(ab, f), "utf8"));
  const by = (arr, prefix) => arr.find((x) => x.label.startsWith(prefix));
  const idle = rd("idle-results.json"), idle2 = rd("idle2-results.json"), idle3 = rd("idle3-results.json");
  const sw = rd("switch/results.json"), swWarm = rd("switch/results-warm.json");
  // A resumed session reports its earlier cost too; the earlier session's cost is subtracted. A fresh session needs no correction.
  const resumed = (x) => ({ costUsd: x.costUsd - baseCost, cacheWrite: x.cacheWrite, cacheRead: x.cacheRead });
  const fresh = (x) => ({ costUsd: x.costUsd, cacheWrite: x.cacheWrite, cacheRead: x.cacheRead });
  const dayOf = (x) => awstDay(Date.parse(x.at));

  // The minutes idle are in each label ("C3 +180 min").
  const minOf = (x) => Number(x.label.match(/\+(\d+) min/)[1]);
  // Cold returns: 2026-10-09 C1 and C2 at +65 min, C3 at +180 min; 2026-10-10 three at +65 min. (W was a warm-up.)
  const coldRow = (x, id) => {
    const c = resumed(x);
    return { id, batch: dayOf(x), idleMin: minOf(x), costUsd: r2(c.costUsd), costExact: c.costUsd, cacheWrite: c.cacheWrite, cacheRead: c.cacheRead };
  };
  const cold = [
    ...["C1", "C2", "C3"].map((id) => coldRow(by(idle, id), id)),
    ...["C1", "C2", "C3"].map((id) => coldRow(by(idle3, id), id)),
  ];
  // Warm handovers: a handover written while the cache is warm (+55 min), then a fresh session reads it.
  const warmRow = (w, f, id) => {
    const a = resumed(w), b = fresh(f);
    return { id, batch: dayOf(w), writeUsd: r2(a.costUsd), freshStartUsd: r2(b.costUsd), totalUsd: r2(a.costUsd + b.costUsd), totalExact: a.costUsd + b.costUsd,
      cacheWrite: a.cacheWrite, cacheRead: a.cacheRead };
  };
  const warm = [
    warmRow(by(idle2, "H1"), by(idle2, "H2"), "H1"),
    ...[1, 2, 3].map((k) => warmRow(by(idle3, "H" + k + "1"), by(idle3, "H" + k + "2"), "H" + k)),
  ];
  const latestDay = awstDay(Date.parse(by(idle3, "C1").at));
  const coldLatest = cold.filter((c) => c.batch === latestDay), warmLatest = warm.filter((w) => w.batch === latestDay);
  const earlierDay = warm[0].batch;
  const ratios = warmLatest.map((w, i) => coldLatest[i].costExact / w.totalExact);
  const sonnet = {
    model: "Sonnet 5.5", contextTokens: 390352,
    cold: cold.map(({ costExact, ...c }) => c),
    warm: warm.map(({ totalExact, ...w }) => w),
    latest: {
      batch: latestDay,
      dateLabel: dateLabel(latestDay),
      idleMin: coldLatest[0].idleMin, // minutes idle before each cold return
      warmAtMin: minOf(by(idle3, "H11")), // minutes after the last reply that the handover was written
      n: warmLatest.length,
      coldN: coldLatest.length,
      coldUsd: coldLatest.map((c) => c.costUsd),
      warmUsd: warmLatest.map((w) => w.totalUsd),
      coldMedianUsd: r2(median(coldLatest.map((c) => c.costUsd))),
      warmMedianUsd: r2(median(warmLatest.map((w) => w.totalUsd))),
      warmMinUsd: Math.min(...warmLatest.map((w) => w.totalUsd)),
      warmMaxUsd: Math.max(...warmLatest.map((w) => w.totalUsd)),
      ratioMin: r1(Math.min(...ratios)), ratioMax: r1(Math.max(...ratios)),
    },
    earlier: {
      batch: earlierDay,
      dateLabel: dateLabel(earlierDay),
      n: warm.filter((w) => w.batch === earlierDay).length,
      coldN: cold.filter((c) => c.batch === earlierDay).length,
      coldUsd: cold.filter((c) => c.batch === earlierDay).map((c) => c.costUsd),
      warmUsd: warm[0].totalUsd,
      ratio: r1(cold[0].costExact / warm[0].totalExact),
    },
  };

  const a = resumed(by(sw, "A")), b1 = resumed(by(swWarm, "B1")), b2 = fresh(by(swWarm, "B2"));
  const opus = {
    model: "Opus 5.5", contextTokens: 390621, n: 1, batch: "2026-10-09",
    coldReturn: { costUsd: r2(a.costUsd), cacheWrite: a.cacheWrite },
    warmHandover: { writeUsd: r2(b1.costUsd), freshStartUsd: r2(b2.costUsd), totalUsd: r2(b1.costUsd + b2.costUsd), cacheWrite: b1.cacheWrite, cacheRead: b1.cacheRead },
  };
  opus.ratio = r1(opus.coldReturn.costUsd / opus.warmHandover.totalUsd);
  return { idle: sonnet, modelSwitch: opus };
}

export function extractAll(ab) {
  const runs = {};
  for (const spec of SPECS) runs[spec.id] = extractRun(ab, spec);
  const all = Object.values(runs);
  const pick = (model, group) => all.filter((r) => r.model === model && r.group === group);
  const groupsFor = (model) => {
    const g = {};
    for (const k of ["relay", "autocompact"]) g[k] = groupStats(pick(model, k));
    const longRuns = pick(model, "long");
    g.long = { n: longRuns.length, finished: longRuns.filter((r) => r.finished).length, runs: longRuns.map((r) => r.id),
      meanTokensM: r1(mean(longRuns.map((r) => r.tokens)) / 1e6), meanCostUsd: r2(mean(longRuns.map((r) => r.costUsd))), meanWallMin: r1(mean(longRuns.map((r) => r.wallMin))),
      minTokensM: Math.min(...longRuns.map((r) => r.tokensM)), maxTokensM: Math.max(...longRuns.map((r) => r.tokensM)),
      medianTokensM: r1(median(longRuns.map((r) => r.tokens)) / 1e6) };
    // how many times the tokens of a clearing method one session that never compacts used (means, as RESULTS.md)
    g.relay.vsLong = r1(g.long.meanTokensM / g.relay.meanTokensM);
    g.autocompact.vsLong = r1(g.long.meanTokensM / g.autocompact.meanTokensM);
    return g;
  };
  const groups = groupsFor("sonnet");
  const opusGroups = groupsFor("opus");
  for (const g of ["trim", "old"]) groups[g] = groupStats(pick("sonnet", g));

  const floor = {};
  for (const g of ["relay", "trim", "old"]) {
    const s = groupStats(FLOOR_RUNS[g].map((id) => runs[id]));
    floor[g] = { floorK: FLOORS[g], runs: s.runs, tokensM: s.meanTokensM, medianTokensM: s.medianTokensM, minTokensM: s.minTokensM, maxTokensM: s.maxTokensM,
      costUsd: s.meanCostUsd, wallMin: s.meanWallMin, replies: s.meanReplies, sessions: s.meanSessions };
    if (FLOOR_PREDICTIONS[g]) floor[g].prediction = FLOOR_PREDICTIONS[g];
  }

  // cost, inside the 2026-10-10 batch only
  const costFor = (model) => {
    const o = {};
    for (const k of ["relay", "autocompact", "long"]) o[k] = batchCost(pick(model, k), COST_BATCH);
    o.gapPct = r0(((o.relay.meanCostUsd - o.autocompact.meanCostUsd) / o.autocompact.meanCostUsd) * 100); // relay mean over auto-compaction mean, in percent
    o.gapPct = Math.abs(o.gapPct);
    o.autoCheaper = o.autocompact.meanCostUsd < o.relay.meanCostUsd;
    return o;
  };
  const cost = { batch: COST_BATCH, dateLabel: dateLabel(COST_BATCH), sonnet: costFor("sonnet"), opus: costFor("opus") };

  // cost at today's list price, every date (RESULTS.md, "All runs re-costed at today's list price"). Finished runs only
  // for mean, median and range, averaged to the cent as printed; a stopped run is still listed.
  const listFor = (model) => {
    const o = {};
    for (const k of ["relay", "autocompact", "long"]) {
      const list = pick(model, k), done = list.filter((r) => r.finished).map((r) => r.listUsd);
      o[k] = { n: list.length, finished: done.length, runs: list.map((r) => r.id),
        meanUsd: r2(mean(done)), medianUsd: r2(median(done)), minUsd: Math.min(...done), maxUsd: Math.max(...done) };
    }
    o.longOverRelayPct = r0(((o.long.meanUsd - o.relay.meanUsd) / o.relay.meanUsd) * 100); // the long session's mean over the relay's
    return o;
  };
  const listCost = { priced: LIST_PRICE.fetched, sonnet: listFor("sonnet"), opus: listFor("opus") };

  // RESULTS.md subtracts the earlier session's cost as printed (US$13.31), so the idle figures do the same.
  const ids = idleAndSwitch(ab, runs.compact.costUsd);
  return {
    meta: {
      task: "30-item website build (PLAN.md), Claude Code with Sonnet 5.5 and Opus 5.5",
      tokenMethod: "dedupe assistant messages by id; sum input + cache read + cache creation of each reply",
      source: "I:/Scratch/_ab (RESULTS.md, site-sonnet/*, relay*, compact*, idle*-results.json, switch/*)",
      planItems: PLAN_ITEMS,
    },
    runs,
    groups,
    opusGroups,
    cost,
    listCost,
    floor,
    predictions: predictionRows(runs, ids.idle, cost),
    ...ids,
  };
}

function main() {
  const i = process.argv.indexOf("--ab");
  const ab = i > 0 ? process.argv[i + 1] : "I:/Scratch/_ab";
  const data = extractAll(ab);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "results.json"), JSON.stringify(data) + "\n");
  fs.writeFileSync(path.join(OUT_DIR, "results.js"), "/* written by site/extract-results.mjs: do not edit. Same object as results.json. */\nvar crResults = " + JSON.stringify(data) + ";\n");
  for (const r of Object.values(data.runs))
    console.log(r.id.padEnd(18), r.batch, String(r.sessions).padStart(2) + " sess", String(r.compactions).padStart(2) + " cmp", String(r.replies).padStart(4) + " replies", (r.tokensM + "M").padStart(7), "$" + r.costUsd, r.wallMin + "min", r.planTicked + "/30");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
