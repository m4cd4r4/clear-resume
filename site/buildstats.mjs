// buildstats.mjs: reads a relay run's transcripts and writes its figures into the site.
// Usage: node site/buildstats.mjs <transcripts-dir> [--since <iso time>]
// Writes site/runstats.js, the data-stat slots between buildstats markers on each page,
// and the F90 to F97 lines in site/FACTS.md. Runs site/buildlog.mjs first when it exists.
// Sample data from an earlier run: site/source/fixture holds the transcripts of an earlier relay run.
// Replaced after this build: run on this build's transcripts, the source becomes "run". After the run, its output is committed as stats: (not a site: commit).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SITE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(SITE);
const FIRST = "Read TASK.md and do it.";
const NEXT = "Continue from the clear-resume handover";
const DONE = "RELAY-SITE-DONE";

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

function parseArgs(argv) {
  const out = { dir: null, since: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--since") out.since = argv[++i];
    else if (!out.dir) out.dir = argv[i];
  }
  if (!out.dir) throw new Error("usage: node site/buildstats.mjs <transcripts-dir> [--since <iso time>]");
  if (!out.since) out.since = git("log", "-1", "--format=%cI", "site-v5-base");
  return out;
}

function readSession(file) {
  const records = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line)); } catch { /* a torn last line */ }
  }
  return records.filter((r) => r.timestamp);
}

// The first real prompt: a string user record, not meta, not a <command-name> or caveat wrapper.
export function firstPrompt(records) {
  for (const r of records) {
    if (r.type !== "user" || r.isMeta) continue;
    const c = r.message && r.message.content;
    if (typeof c !== "string") continue;
    if (c.trimStart().startsWith("<")) continue;
    return c.trimStart();
  }
  return null;
}

function assistantText(r) {
  const c = r.message && r.message.content;
  if (!Array.isArray(c)) return typeof c === "string" ? c : "";
  return c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

// The final reply opens with the marker on a line of its own (a summary may follow).
// A mention mid-sentence, such as a handover repeating the finish line, does not end the run.
export function isDone(r) {
  const c = r.message && r.message.content;
  if (!Array.isArray(c)) return false;
  return c.some((b) => b.type === "text" && new RegExp("^\\W*" + DONE + "\\W*$").test(b.text.trim().split("\n")[0]));
}

function toolResultText(r) {
  const c = r.message && r.message.content;
  if (!Array.isArray(c)) return "";
  return c.filter((b) => b.type === "tool_result").map((b) =>
    typeof b.content === "string" ? b.content : (b.content || []).map((x) => x.text || "").join("\n")).join("\n");
}

export function collect(dir, since) {
  const sinceMs = Date.parse(since);
  const sessions = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"))) {
    const records = readSession(path.join(dir, f));
    if (!records.length) continue;
    const start = Date.parse(records[0].timestamp);
    const prompt = firstPrompt(records);
    if (start < sinceMs || !prompt) continue;
    if (!prompt.startsWith(FIRST) && !prompt.startsWith(NEXT)) continue;
    sessions.push({ id: path.basename(f, ".jsonl"), start, prompt, records });
  }
  sessions.sort((a, b) => a.start - b.start);

  const chain = [];
  let doneAt = null;
  for (const s of sessions) {
    if (!chain.length && !s.prompt.startsWith(FIRST)) continue;
    if (chain.length && s.prompt.startsWith(FIRST)) break; // a second run starts here
    const cut = s.records.findIndex((r) => r.type === "assistant" && isDone(r));
    if (cut >= 0) { s.records = s.records.slice(0, cut + 1); doneAt = Date.parse(s.records[cut].timestamp); }
    chain.push(s);
    if (doneAt) break;
  }
  if (!chain.length) throw new Error("no session starting with \"" + FIRST + "\" at or after " + since);
  return { chain, doneAt };
}

export function measure({ chain, doneAt }) {
  const t0 = chain[0].start;
  const mins = (t) => Math.round((t - t0) / 600) / 100;
  let tokens = 0;
  let nudgeAt = null;
  const out = chain.map((s) => {
    const seen = new Set();
    const points = [];
    for (const r of s.records) {
      // The nudge reaches Claude in a tool result, or as a PostToolUse hook attachment (Claude Code 2.1.28x).
      const nudgeText = r.type === "user" ? toolResultText(r) : r.type === "attachment" && r.attachment ? String(r.attachment.stdout || "") : "";
      if (nudgeAt === null && nudgeText) {
        const m = nudgeText.match(/threshold (\d+)k/);
        if (m) nudgeAt = Number(m[1]) * 1000;
      }
      const u = r.type === "assistant" && r.message && r.message.usage;
      if (!u || !r.message.id || seen.has(r.message.id)) continue;
      seen.add(r.message.id);
      const context = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      tokens += context;
      points.push([mins(Date.parse(r.timestamp)), context]);
    }
    const end = Date.parse(s.records[s.records.length - 1].timestamp);
    return { id: s.id, start: new Date(s.start).toISOString(), end: new Date(end).toISOString(), points };
  });
  const last = doneAt || Date.parse(out[out.length - 1].end);
  const sessions = out.length;
  const clears = sessions - 1; // automatic clears: every session after the first began with a /clear
  const minutes = (Math.round((last - t0) / 6000) / 10).toFixed(1); // run start to RELAY-SITE-DONE
  const tokensSent = (Math.round(tokens / 1e5) / 10).toFixed(1) + "M"; // context summed over every reply
  return { sessions: out, nudgeAt, totals: { sessions, clears, minutes, tokens: tokensSent } };
}

export const awst = (iso) => {
  const d = new Date(Date.parse(iso) + 8 * 3600e3);
  return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const awstDate = (iso) => {
  const d = new Date(Date.parse(iso) + 8 * 3600e3);
  return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
};

function gitFigures(fixture) {
  if (fixture) return { commits: "n/a", first: "n/a", last: "n/a", date: "n/a" };
  const lines = git("log", "site-v5-base..site-v5", "--grep", "^site:", "--format=%cI").split("\n").filter(Boolean);
  const commits = lines.length; // git log site-v5-base..site-v5 --grep "^site:" --oneline, counted
  return { commits, first: commits ? awst(lines[commits - 1]) : "n/a", last: commits ? awst(lines[0]) : "n/a",
    date: commits ? awstDate(lines[0]) : "n/a" };
}

function between(text, begin, end, body, file) {
  const a = text.indexOf(begin), b = text.indexOf(end);
  if (a < 0 || b < a) throw new Error("markers " + begin + " / " + end + " missing in " + file);
  return text.slice(0, a + begin.length) + body + text.slice(b);
}

function fillSlots(file, values) {
  const p = path.join(SITE, file);
  if (!fs.existsSync(p)) return 0;
  let html = fs.readFileSync(p, "utf8");
  let n = 0;
  html = html.replace(/(<!-- buildstats:begin -->)([\s\S]*?)(<!-- buildstats:end -->)/g, (all, a, region, b) =>
    a + region.replace(/(<([a-z0-9]+)\b[^>]*\bdata-stat="(\w+)"[^>]*>)[^<]*(<\/\2>)/g, (m, open, tag, key, close) => {
      if (!(key in values)) return m;
      n++;
      return open + values[key] + close;
    }) + b);
  fs.writeFileSync(p, html);
  return n;
}

// FACTS.md lines: each cites the line of this file that computes its figure.
const FACTS_ROWS = [
  ["F90", "{sessions} sessions", "sessions", "const sessions = out.length;", "sessions in the run chain"],
  ["F91", "{clears} automatic clears", "clears", "const clears = sessions - 1;", "sessions after the first, each begun by a /clear"],
  ["F92", "{commits} site: commits", "commits", "const commits = lines.length;", "site: commits since site-v5-base"],
  ["F93", "{minutes} minutes", "minutes", "const minutes = (Math.round((last - t0) / 6000) / 10).toFixed(1);", "run start to the RELAY-SITE-DONE reply"],
  ["F94", "{tokens} tokens sent", "tokens", "const tokensSent = (Math.round(tokens / 1e5) / 10).toFixed(1) + \"M\";", "context summed over every reply"],
  ["F95", "{first}", "first", "first: commits ? awst(lines[commits - 1]) : \"n/a\"", "oldest site: commit, AWST"],
  ["F96", "{last}", "last", "last: commits ? awst(lines[0]) : \"n/a\"", "newest site: commit, AWST"],
  ["F97", "{date}", "date", "date: commits ? awstDate(lines[0]) : \"n/a\"", "AWST date of the newest site: commit"],
];

function factsBlock(values) {
  const self = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  return "\n" + FACTS_ROWS.map(([id, page, key, code, what]) => {
    const ln = self.findIndex((l) => l.includes(code) && !l.includes("FACTS_ROWS") && !l.trimStart().startsWith("[\"F")) + 1;
    if (!ln) throw new Error("code line for " + id + " not found");
    return id + " | page: \"" + page + "\" | source: \"" + code + "\" | site/buildstats.mjs:" + ln +
      " | value: " + values[key] + " (" + what + ", buildstats.mjs)";
  }).join("\n") + "\n";
}

function main() {
  const { dir, since } = parseArgs(process.argv.slice(2));
  const buildlog = path.join(SITE, "buildlog.mjs");
  if (fs.existsSync(buildlog)) execFileSync(process.execPath, [buildlog], { cwd: ROOT, stdio: "inherit" });

  const fixture = path.resolve(dir) === path.join(SITE, "source", "fixture");
  const m = measure(collect(dir, since));
  const g = gitFigures(fixture);
  const totals = { ...m.totals, commits: g.commits };
  // git: the figures frozen here, so a copy of the site outside this repo (no site-v5 tags) can still be checked.
  const crRun = { source: fixture ? "fixture" : "run", since, nudgeAt: m.nudgeAt, sessions: m.sessions, totals, git: g };

  const rs = path.join(SITE, "runstats.js");
  fs.writeFileSync(rs, between(fs.readFileSync(rs, "utf8"), "/* buildstats:begin */", "/* buildstats:end */",
    "\nvar crRun = " + JSON.stringify(crRun) + ";\n", "runstats.js"));

  const values = { ...m.totals, commits: g.commits, first: g.first, last: g.last, date: g.date };
  let slots = 0;
  for (const page of ["index.html", "how-it-works.html", "changelog.html"]) slots += fillSlots(page, values);

  const fp = path.join(SITE, "FACTS.md");
  fs.writeFileSync(fp, between(fs.readFileSync(fp, "utf8"), "<!-- buildstats:begin -->", "<!-- buildstats:end -->",
    factsBlock(values), "FACTS.md"));

  console.log("source   " + crRun.source);
  console.log("sessions " + totals.sessions);
  console.log("clears   " + totals.clears);
  console.log("commits  " + totals.commits);
  console.log("minutes  " + totals.minutes);
  console.log("tokens   " + totals.tokens);
  console.log("first    " + g.first + "  last " + g.last);
  console.log("nudgeAt  " + m.nudgeAt);
  console.log("slots    " + slots + " filled");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
