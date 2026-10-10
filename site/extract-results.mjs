// extract-results.mjs: reads the A/B transcripts and raw results and writes the ONE data file
// behind the results page and the results video.
// Usage: node site/extract-results.mjs [--ab I:/Scratch/_ab]
// Writes site/media/results/results.json and results.js (the same object as `var crResults = ...;`, so the
// page works from disk). Every figure is computed here from transcripts, stream.jsonl, git logs and the raw
// idle/switch result files. Nothing is typed in except the two predictions, which are quoted from RESULTS.md.
// Token method (same as site/buildstats.mjs measure()): dedupe assistant messages by id, then sum
// input + cache read + cache creation tokens of each reply.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SITE = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.join(SITE, "media", "results");

// arm directory -> group. The groups are the findings' arms.
export const ARMS = {
  relay: "relay", "relay-r2": "relay", "relay-r3": "relay",
  compact200: "autocompact", "compact200-r2": "autocompact", "compact200-r3": "autocompact",
  compact: "long",
  "relay-trim": "trim", "relay-trim-r2": "trim", "relay-trim-r3": "trim",
  "relay-old": "old", "relay-old-r2": "old", "relay-old-r3": "old",
};
// Floor runs carry totals only: their per-reply series is not needed by any finding.
const SERIES_GROUPS = new Set(["relay", "autocompact", "long"]);
const PLAN_ITEMS = 30;

const readJsonl = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

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

function streamTotals(file) {
  let cost = 0, results = 0;
  for (const r of readJsonl(file)) if (r.type === "result") { results++; cost += r.total_cost_usd || 0; }
  return { cost, results };
}

export function extractRun(ab, arm) {
  const root = path.join(ab, "site-sonnet", arm);
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
  const group = ARMS[arm];
  let calls = 0;
  const run = {
    id: arm,
    group,
    started: startedIso,
    sessions: sessions.length,
    clears: sessions.length - 1,
    compactions: compactions.length,
    replies: all.length,
    toolCalls: all.reduce((n, x) => n + x.calls, 0),
    tokens,
    tokensM: r1(tokens / 1e6),
    costUsd: r2(totals.cost),
    costExact: totals.cost,
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
  if (SERIES_GROUPS.has(group)) {
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
  return {
    n: runs.length,
    finished: done.length,
    runs: runs.map((r) => r.id),
    // means are over the runs that finished all 30 items; an unfinished run did two thirds of the work
    meanTokensM: r1(tok.mean / 1e6), minTokensM: r1(tok.min / 1e6), maxTokensM: r1(tok.max / 1e6),
    meanCostUsd: r2(cost.mean), meanWallMin: r1(wall.mean),
    meanReplies: Math.round(rep.mean), meanSessions: r1(ses.mean),
    // the page marks the median of the runs that finished, the figure no single best run can move
    medianTokensM: r1(median(done.map((r) => r.tokens)) / 1e6), medianCostUsd: r2(median(done.map((r) => r.costUsd))), medianWallMin: r1(median(done.map((r) => r.wallMin))),
  };
}

// The prediction was written before the floor runs (RESULTS.md, 2026-10-08 12:30 AWST); quoted, not recomputed.
export const PREDICTIONS = {
  trim: { predictedTokensM: 42.5, source: "about 42.5M (vs 35.1M, +21%)", writtenAt: "2026-10-08 12:30 AWST" },
  old: { predictedTokensM: 49.4, source: "about 49.4M (+41%)", writtenAt: "2026-10-08 12:30 AWST" },
};
export const FLOORS = { relay: 22.1, trim: 45.9, old: 67.9 }; // measured smoke-reply floors, k tokens (RESULTS.md)

function idleAndSwitch(ab, baseCost) {
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(ab, f), "utf8"));
  const by = (arr, prefix) => arr.find((x) => x.label.startsWith(prefix));
  const idle = rd("idle-results.json"), idle2 = rd("idle2-results.json");
  const sw = rd("switch/results.json"), swWarm = rd("switch/results-warm.json");
  // A resumed session reports its earlier cost too; the earlier session's cost is subtracted. A fresh session needs no correction.
  const resumed = (x) => ({ costUsd: x.costUsd - baseCost, cacheWrite: x.cacheWrite, cacheRead: x.cacheRead });
  const fresh = (x) => ({ costUsd: x.costUsd, cacheWrite: x.cacheWrite, cacheRead: x.cacheRead });
  const IDLE_MIN = { W: null, C1: 65, C2: 65, C3: 180 }; // minutes idle before the return; W's cache was already cold
  const cold = Object.keys(IDLE_MIN).map((p) => ({ id: p, idleMin: IDLE_MIN[p], ...resumed(by(idle, p)) }));
  const h1 = resumed(by(idle2, "H1")), h2 = fresh(by(idle2, "H2"));
  const sonnet = {
    model: "Sonnet 5.5", contextTokens: 390352, n: 1,
    coldReturn: { costUsd: r2(resumed(by(idle, "C1")).costUsd), cacheWrite: by(idle, "C1").cacheWrite, idleMin: 65 },
    coldReturns: cold.map((c) => ({ id: c.id, idleMin: c.idleMin, costUsd: r2(c.costUsd), cacheWrite: c.cacheWrite, cacheRead: c.cacheRead })),
    warmHandover: { writeUsd: r2(h1.costUsd), freshStartUsd: r2(h2.costUsd), totalUsd: r2(h1.costUsd + h2.costUsd), cacheWrite: h1.cacheWrite, cacheRead: h1.cacheRead },
  };
  const a = resumed(by(sw, "A")), b1 = resumed(by(swWarm, "B1")), b2 = fresh(by(swWarm, "B2"));
  const opus = {
    model: "Opus 5.5", contextTokens: 390621, n: 1,
    coldReturn: { costUsd: r2(a.costUsd), cacheWrite: a.cacheWrite },
    warmHandover: { writeUsd: r2(b1.costUsd), freshStartUsd: r2(b2.costUsd), totalUsd: r2(b1.costUsd + b2.costUsd), cacheWrite: b1.cacheWrite, cacheRead: b1.cacheRead },
  };
  for (const x of [sonnet, opus]) x.ratio = r1(x.coldReturn.costUsd / x.warmHandover.totalUsd);
  return { idle: sonnet, modelSwitch: opus };
}

export function extractAll(ab) {
  const runs = {};
  for (const arm of Object.keys(ARMS)) runs[arm] = extractRun(ab, arm);
  const byGroup = (g) => Object.values(runs).filter((r) => ARMS[r.id] === g);
  const groups = {};
  for (const g of ["relay", "autocompact", "trim", "old"]) groups[g] = groupStats(byGroup(g));
  groups.long = { n: 1, finished: 1, runs: ["compact"], meanTokensM: runs.compact.tokensM, meanCostUsd: runs.compact.costUsd, meanWallMin: runs.compact.wallMin };
  groups.relay.vsLong = r1(runs.compact.tokensM / groups.relay.meanTokensM);
  groups.autocompact.vsLong = r1(runs.compact.tokensM / groups.autocompact.meanTokensM);
  const floor = {};
  for (const g of ["relay", "trim", "old"]) {
    floor[g] = { floorK: FLOORS[g], runs: groups[g].runs, tokensM: groups[g].meanTokensM, medianTokensM: groups[g].medianTokensM, minTokensM: groups[g].minTokensM, maxTokensM: groups[g].maxTokensM,
      costUsd: groups[g].meanCostUsd, wallMin: groups[g].meanWallMin, replies: groups[g].meanReplies, sessions: groups[g].meanSessions };
    if (PREDICTIONS[g]) floor[g].prediction = PREDICTIONS[g];
  }
  return {
    meta: {
      task: "30-item website build (PLAN.md), Claude Code with Sonnet 5.5",
      tokenMethod: "dedupe assistant messages by id; sum input + cache read + cache creation of each reply",
      source: "I:/Scratch/_ab (RESULTS.md, site-sonnet/*, idle-results.json, idle2-results.json, switch/*)",
      planItems: PLAN_ITEMS,
    },
    runs,
    groups,
    floor,
    ...idleAndSwitch(ab, runs.compact.costExact),
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
    console.log(r.id.padEnd(14), String(r.sessions).padStart(2) + " sess", String(r.compactions).padStart(2) + " cmp", String(r.replies).padStart(4) + " replies", (r.tokensM + "M").padStart(7), "$" + r.costUsd, r.wallMin + "min", r.planTicked + "/30");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
