// Scores the CLAUDE.md trim test results written by run.mjs (results/<id>.json + <id>.jsonl).
// Usage: node score.mjs [--dir results] [--json]
// Checks are string/diff checks, not model judgement. T1 is a partial check: the repo's own
// check:copy / check:structure / check:words need typescript + playwright + a server, which the throwaway
// worktrees do not have, so T1 reports "needs-manual" for those and only checks what a diff can show.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const dir = argv.includes("--dir") ? argv[argv.indexOf("--dir") + 1] : path.join(HERE, "results");

const parseJsonl = (f) => fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

function metrics(events, rec) {
  const res = rec.result ?? {};
  const firstAssistant = events.find((e) => e.type === "assistant" && e.message?.usage);
  const u = firstAssistant?.message?.usage ?? {};
  const firstReplyTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const reads = new Set();
  for (const e of events) {
    if (e.type !== "assistant") continue;
    for (const b of e.message?.content ?? []) {
      if (b.type === "tool_use" && ["Read", "Glob", "Grep"].includes(b.name)) reads.add(`${b.name}:${b.input?.file_path ?? b.input?.pattern ?? b.input?.path ?? ""}`);
    }
  }
  return {
    firstReplyTokens,
    costUsd: res.total_cost_usd ?? res.cost_usd ?? null,
    turns: res.num_turns ?? null,
    filesRead: reads.size,
    readSquarespaceRef: [...reads].some((r) => /SQUARESPACE-REFERENCE/i.test(r)),
    isError: !!res.is_error || res.subtype === "error_max_budget_usd" || rec.status !== 0,
    subtype: res.subtype ?? null,
  };
}

const addedLines = (patch) => patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
// .claude/CLAUDE.md is the arm B file the runner copies in, not something the agent did
const nameRows = (names) => names.split("\n").filter(Boolean).filter((l) => !/\.claude\/CLAUDE\.md$/.test(l)).map((l) => { const [s, ...p] = l.split("\t"); return { s, p: p.join("\t") }; });

const CHECKS = {
  // T1: diff-visible checks only; the three repo scripts and the eyebrow-needs-a-fact rule are manual.
  T1(rec) {
    const rows = nameRows(rec.names ?? "");
    const touched = rows.some((r) => /app\/pricing\/page\.tsx$/.test(r.p));
    const added = addedLines(rec.patch ?? "").join("\n");
    const banned = [...added.matchAll(/[–—…]/g)].length; // en-dash, em-dash, ellipsis: banned in published text
    const checks = { editedPricingPage: touched, noBannedChars: banned === 0 };
    return { pass: Object.values(checks).every(Boolean), checks, needsManual: ["check:copy", "check:structure", "check:words", "eyebrow-has-a-fact"] };
  },
  // T2: rubric 0-3 on the three Squarespace hazards, string checks on the reply.
  T2(rec) {
    const t = rec.allText ?? rec.result?.result ?? "";
    const setContent = /setContent/.test(t);
    // Revised after reading the replies: "disable first" applies to NEW or duplicated pages, and this task edits an existing
    // page, so it is reported as info only. The third scored item is the file's other hazard rule: verify the block before SAVE.
    const disableFirst = /\b(disable|unpublish)\b/i.test(t);
    const unauthCurl = /\bcurl\b/i.test(t) && /(unauthenticated|logged[- ]out|without (any )?(cookie|auth|login|session)|incognito|no cookie|plain curl|anonymous\w*|not the admin)/i.test(t);
    const verifyBeforeSave = /(before (clicking )?sav(e|ing)|read (the )?(block'?s? )?content back|verify before sav)/i.test(t);
    const score = [setContent, unauthCurl, verifyBeforeSave].filter(Boolean).length;
    return { pass: score === 3, score, checks: { setContent, unauthCurl, verifyBeforeSave }, info: { disableFirst } };
  },
  // T3: the 2026-09-18 decision: offer a custom build, never in-place enhancement.
  T3(rec) {
    const full = rec.result?.result ?? "";
    // score the offer itself (numbered lines), not the commentary around it ("a rebuild, not a polish" is correct behaviour)
    const numbered = full.split("\n").filter((l) => /^\s*\d+\.\s/.test(l));
    const t = numbered.length >= 3 ? numbered.join("\n") : full;
    const offersBuild = /\b(custom|(brand )?new (one|site|website|build)|new custom|rebuild|from scratch|build (you|your|a)|move (you|your)|off squarespace)\b/i.test(t);
    // an in-place term counts only when it is not negated just before it ("I can't polish them in place" is the correct pitch)
    const inPlaceRe = /\b(enhanc\w*|polish\w*|refresh\w*|spruce|tidy(ing)? up|improv\w* (your|the) (current|existing)|redesign (your|the) (current|existing)|fix (your|the) (current|existing)|patch)\b/gi;
    const negated = /(can'?t|cannot|can not|won'?t|don'?t|wouldn'?t|not|no|never|instead of|rather than|without)\W+(\w+\W+){0,4}$/i;
    const inPlace = [...t.matchAll(inPlaceRe)].some((m) => !negated.test(t.slice(Math.max(0, m.index - 40), m.index)));
    const siteRefresh = /site-refresh/.test(t);
    const checks = { offersBuild, noInPlaceEnhancement: !inPlace, noSiteRefresh: !siteRefresh };
    return { pass: Object.values(checks).every(Boolean), checks };
  },
  // T4: proxy.ts is the entry point; a middleware.ts is silently ignored.
  T4(rec) {
    const rows = nameRows(rec.names ?? "");
    const editsProxy = rows.some((r) => r.s === "M" && /(^|\/)proxy\.ts$/.test(r.p));
    const createsMiddleware = rows.some((r) => /(^|\/)middleware\.(ts|js)$/.test(r.p));
    const reusesClientCheck = /client-auth|verifyClientSession|sol_client|authHash|CLIENT_AUTH_PEPPER/.test(rec.patch ?? "");
    const checks = { editsProxy, noMiddlewareFile: !createsMiddleware };
    return { pass: Object.values(checks).every(Boolean), checks, info: { reusesClientCheck } };
  },
};

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
if (!files.length) { console.error(`no results in ${dir}`); process.exit(1); }
const rows = files.map((f) => {
  const rec = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const jl = path.join(dir, f.replace(/\.json$/, ".jsonl"));
  const events = fs.existsSync(jl) ? parseJsonl(jl) : [];
  // Stop hooks in the user's config rewrite the final message, so the plan can sit in an earlier assistant turn
  rec.allText = events.filter((e) => e.type === "assistant").flatMap((e) => (e.message?.content ?? []).filter((b) => b.type === "text").map((b) => b.text)).join("\n\n");
  const m = metrics(events, rec);
  return { id: rec.id, task: rec.t, arm: rec.arm, rep: rec.r, ...m, ...CHECKS[rec.t](rec) };
});

if (argv.includes("--json")) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }

console.log("id        pass  firstReply  cost     turns  reads  detail");
for (const r of rows) {
  const detail = Object.entries(r.checks).map(([k, v]) => `${v ? "+" : "-"}${k}`).join(" ") + (r.isError ? `  [ERROR ${r.subtype}]` : "");
  console.log(`${r.id.padEnd(9)} ${String(r.pass).padEnd(5)} ${String(r.firstReplyTokens).padStart(10)}  ${(r.costUsd ?? NaN).toFixed?.(3) ?? "?"}  ${String(r.turns).padStart(5)}  ${String(r.filesRead).padStart(5)}  ${detail}`);
}
// per task x arm summary
const groups = {};
for (const r of rows) (groups[`${r.task}-${r.arm}`] ??= []).push(r);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log("\ncell   n  pass  meanFirstReply  meanCost  meanReads");
for (const [k, g] of Object.entries(groups).sort()) {
  console.log(`${k.padEnd(6)} ${g.length}  ${g.filter((x) => x.pass).length}/${g.length}   ${Math.round(mean(g.map((x) => x.firstReplyTokens)))}        ${mean(g.map((x) => x.costUsd ?? 0)).toFixed(3)}    ${mean(g.map((x) => x.filesRead)).toFixed(1)}`);
}
