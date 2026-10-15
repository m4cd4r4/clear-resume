#!/usr/bin/env node
// Estimate what idle returns cost on this machine, from real Claude Code transcripts.
// Usage: node scripts/idle-cost.mjs [--dir <projects dir>] [--ttl <minutes>] [--by day|month]
// Node 18+, ESM, no dependencies.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIST_PRICE } from "../site/extract-results.mjs";

const MIN = 60_000;

// US$/MTok to write the 1h cache (Claude Code on a subscription writes the 1h cache). The three ids in
// LIST_PRICE come from there (index 1); the rest from platform.claude.com/docs/en/about-claude/pricing,
// fetched 2026-10-11.
const WRITE_PRICE = {
  ...Object.fromEntries(Object.entries(LIST_PRICE).filter(([k]) => k.startsWith("claude-")).map(([k, v]) => [k, v[1]])),
  "claude-opus-5": 10,
  "claude-opus-4-8": 10,
  "claude-sonnet-5": 4,
  "claude-fable-5": 20,
  "claude-fable-5-1": 20,
  "claude-haiku-5-5": (context) => (context > 100_000 ? 1 : 0.2), // priced by prompt size
};
// The longest id that prefixes the model name, so claude-opus-5-5 is not priced as claude-opus-5.
const writePrice = (model, context) => {
  const key = Object.keys(WRITE_PRICE).filter((k) => String(model).startsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (!key) return null;
  const p = WRITE_PRICE[key];
  return typeof p === "function" ? p(context) : p;
};

const readRecords = (file) => {
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a torn last line */ }
  }
  return out;
};

// Main-thread replies in order, one per message id, with the context each one carried:
// input + cache read + cache creation (the same count site/buildstats.mjs measure() uses).
const replies = (file) => {
  const seen = new Set();
  const out = [];
  for (const r of readRecords(file)) {
    const u = r.type === "assistant" && !r.isSidechain && r.message && r.message.usage;
    if (!u || !r.message.id || !r.timestamp || seen.has(r.message.id)) continue;
    seen.add(r.message.id);
    out.push({
      ts: Date.parse(r.timestamp),
      model: r.message.model,
      context: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
    });
  }
  return out;
};

// A cold return: the next reply came more than ttlMin after the previous one, so the
// cache had expired and the whole context was written again.
export function scan(files, { ttlMin = 60 } = {}) {
  const cold = [];
  let skipped = 0; // gaps on a model with no price: counted by model, never guessed
  const skippedModels = {};
  for (const file of files) {
    const rs = replies(file);
    for (let i = 1; i < rs.length; i++) {
      const gapMin = (rs[i].ts - rs[i - 1].ts) / MIN;
      if (gapMin <= ttlMin) continue;
      const { context, model } = rs[i - 1];
      const price = writePrice(model, context);
      if (price === null) { skipped++; skippedModels[model] = (skippedModels[model] || 0) + 1; continue; }
      cold.push({ file, ts: rs[i].ts, gapMin, context, model, usd: (context * price) / 1e6 });
    }
  }
  return { cold, skipped, skippedModels };
}

// A handover before the cache expires cost about a tenth of the cold return: US$0.15 to US$0.17
// against US$1.56 for a 390k Sonnet 5.5 session (n=3). Measured at that size only; other sizes
// are scaled by this ratio, not measured.
export const HANDOVER_SHARE = 0.1;

// Per UTC day or month: cold returns, what they cost to rewrite, and the handover alternative.
export function summarise(cold, by = "month") {
  const len = by === "day" ? 10 : 7;
  const rows = new Map();
  for (const c of cold) {
    const period = new Date(c.ts).toISOString().slice(0, len);
    const row = rows.get(period) || { period, returns: 0, coldUsd: 0, handoverUsd: 0 };
    row.returns++;
    row.coldUsd += c.usd;
    row.handoverUsd += c.usd * HANDOVER_SHARE;
    rows.set(period, row);
  }
  return [...rows.values()].sort((x, y) => (x.period < y.period ? -1 : 1));
}

// <dir>/<project>/*.jsonl: the main transcripts. Subagent transcripts sit one level deeper and are left out.
const transcripts = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())
    .flatMap((d) => fs.readdirSync(path.join(dir, d.name)).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(dir, d.name, f)));

const usd = (n) => "US$" + n.toFixed(2);

function main(argv) {
  const opt = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
  const dir = opt("--dir", path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "projects"));
  const ttlMin = Number(opt("--ttl", 60));
  const by = opt("--by", "month");
  if (!fs.existsSync(dir)) { console.error("idle-cost: no such directory: " + dir); process.exit(1); }

  const files = transcripts(dir);
  const { cold, skipped, skippedModels } = scan(files, { ttlMin });
  const rows = summarise(cold, by);
  const total = rows.reduce((t, r) => ({ returns: t.returns + r.returns, coldUsd: t.coldUsd + r.coldUsd, handoverUsd: t.handoverUsd + r.handoverUsd }),
    { returns: 0, coldUsd: 0, handoverUsd: 0 });

  const line = (a, b, c, d) => a.padEnd(12) + String(b).padStart(8) + c.padStart(14) + d.padStart(16);
  console.log("Cold returns: a gap of more than " + ttlMin + " min between two replies, so the cache had expired (" + files.length + " transcripts, UTC " + by + "s).");
  console.log(line("period", "returns", "cold cost", "with handover"));
  for (const r of rows) console.log(line(r.period, r.returns, usd(r.coldUsd), usd(r.handoverUsd)));
  console.log(line("Total", total.returns, usd(total.coldUsd), usd(total.handoverUsd)));
  if (skipped) {
    const by = Object.entries(skippedModels).sort((x, y) => y[1] - x[1]).map(([m, n]) => m + " " + n).join(", ");
    console.log("Skipped " + skipped + " gap(s) on a model with no list price (" + by + "). The totals above leave these out, so they are a lower bound.");
  }
  console.log("");
  console.log("Cold cost = context before the gap x the 1h cache-write list price, per model. Costs are API-equivalent; a subscription does not bill them.");
  console.log("With handover = " + HANDOVER_SHARE * 100 + "% of cold cost. That ratio is measured at 390k only (US$0.15 to US$0.17 vs US$1.56, Sonnet 5.5, n=3); other sizes are scaled, not measured.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
