// factcheck.mjs: checks every claim on the pages against site/FACTS.md, and FACTS.md against its sources.
// Usage: node site/factcheck.mjs [page.html ...]   (default: every page of the three that exists)
// Exits 1 on any FAIL.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { awst, awstDate } from "./buildstats.mjs";

const SITE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(SITE);
const PAGES = ["index.html", "replay-archive.html", "how-it-works.html", "changelog.html"];
const RESULTS = path.join(SITE, "media", "results");
const STRONG = ["real", "actual", "live", "same", "measured", "always", "never", "only", "every", "all", "nothing"];
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
// Control names (what a button or link does) are not claims; they are checked only for numbers.
const CONTROLS = new Set(["a", "button", "nav", "input", "select", "textarea", "summary"]);

const fails = [];
const fail = (where, msg) => fails.push(where + ": " + msg);
const norm = (s) => s.replace(/\s+/g, " ").trim();
const numbers = (s) => s.replace(/\{[\w.]+\}/g, "").match(/\d+(?:[.,]\d+)*/g) || [];
const read = (p) => fs.readFileSync(p, "utf8");

// ---- FACTS.md ----------------------------------------------------------------------------

function parseFacts(text) {
  const facts = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(/^(F\d+) \| (.*)$/);
    if (!m) continue;
    let rest = m[2].replace(/ \| value: .*$/, "");
    const row = { id: m[1], page: null, sources: [] };
    const field = /^(page|source): "(.*?)"(?= \| |$)/;
    while (rest) {
      const f = rest.match(field);
      if (!f) { fail("FACTS.md " + m[1], "cannot parse near: " + rest.slice(0, 60)); break; }
      const quote = f[2].replace(/\\"/g, "\"");
      rest = rest.slice(f[0].length).replace(/^ \| /, "");
      if (f[1] === "page") { row.page = quote; continue; }
      const ref = rest.match(/^([^|]+?)(?= \| |$)/);
      const src = { quote, ref: ref && !/^(page|source):/.test(ref[1]) ? ref[1].trim() : null };
      if (src.ref) rest = rest.slice(ref[0].length).replace(/^ \| /, "");
      row.sources.push(src);
    }
    if (facts.has(row.id)) fail("FACTS.md " + row.id, "id used twice");
    facts.set(row.id, row);
  }
  return facts;
}

// Bare names are the repo's own docs, read live, so the site fails its check when they change under it.
// TASK.md is the brief of the run that built the site (site/source/), a source only for the Media box.
const BARE = { "README.md": "README.md", "CHANGELOG.md": "CHANGELOG.md", "STATUS.md": "docs/STATUS.md" };

function sourceFile(ref) {
  const named = ref.match(/^(FACTS\.md|TASK\.md): (.+)$/);
  if (named) return { file: named[1] === "FACTS.md" ? path.join(SITE, "FACTS.md") : path.join(SITE, "source", "TASK.md"), section: named[2] };
  const m = ref.match(/^([\w./-]+):(\d+)$/);
  if (!m) return null;
  const file = m[1].includes("/") ? path.join(ROOT, m[1]) : BARE[m[1]] ? path.join(ROOT, BARE[m[1]]) : path.join(SITE, "source", m[1]);
  return { file, line: Number(m[2]) };
}

// The text under a "## <name>" heading, up to the next heading of that level or higher.
function section(text, name) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => /^#{2,3} /.test(l) && l.replace(/^#+ /, "").startsWith(name));
  if (i < 0) return null;
  const j = lines.findIndex((l, k) => k > i && /^#{1,3} /.test(l));
  return lines.slice(i + 1, j < 0 ? undefined : j).join("\n");
}

// ---- results.json: the one data file behind the results page and video ---------------------

const resultsData = () => JSON.parse(read(path.join(RESULTS, "results.json")));
const resultsLib = () => {
  const ctx = {};
  vm.runInNewContext(read(path.join(RESULTS, "charts-core.js")), ctx);
  return ctx.crCharts;
};

function checkSources(row) {
  const where = "FACTS.md " + row.id;
  if (row.page === null) return fail(where, "no page quote");
  if (!row.sources.length) return fail(where, "no source");
  for (const s of row.sources) {
    if (!s.ref) { fail(where, "source without a file:line"); continue; }
    const rj = s.ref.match(/^results\.json: (.+)$/);
    if (rj) {
      const v = resultsLib().get(resultsData(), rj[1]);
      if (v === undefined) fail(where, "no path " + rj[1] + " in results.json");
      else if (String(v) !== norm(s.quote)) fail(where, "quote \"" + s.quote + "\" is not the value of " + rj[1] + " (" + v + ")");
      continue;
    }
    const loc = sourceFile(s.ref);
    if (!loc) { fail(where, "unreadable ref " + s.ref); continue; }
    if (!fs.existsSync(loc.file)) { fail(where, "missing file " + s.ref); continue; }
    const text = read(loc.file);
    const q = norm(s.quote);
    if (loc.section !== undefined) {
      if (loc.file.endsWith("TASK.md") && loc.section !== "Media box") { fail(where, "TASK.md is a source only for the Media box"); continue; }
      const body = section(text, loc.section);
      if (body === null) fail(where, "no section \"" + loc.section + "\" in " + path.basename(loc.file));
      else if (!norm(body).includes(q)) fail(where, "quote not in " + s.ref + ": \"" + s.quote.slice(0, 60) + "\"");
      continue;
    }
    if (!norm(text).includes(q)) { fail(where, "quote not in " + s.ref + ": \"" + s.quote.slice(0, 60) + "\""); continue; }
    const near = norm(text.split("\n").slice(loc.line - 1, loc.line + 3).join("\n"));
    if (!near.includes(q)) fail(where, "quote is in the file but not at " + s.ref);
  }
  const srcText = row.sources.map((s) => s.quote).join(" ");
  const have = new Set(numbers(srcText));
  for (const n of numbers(row.page)) if (!have.has(n)) fail(where, "page shows " + n + ", no source quote does");
  for (const w of STRONG) {
    const re = new RegExp("\\b" + w + "\\b", "i");
    if (re.test(row.page) && !re.test(srcText)) fail(where, "page says \"" + w + "\", no source quote does");
  }
}

// ---- HTML --------------------------------------------------------------------------------

const ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
const decode = (s) => s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e] ?? m);

function parseHtml(html) {
  const root = { tag: "#root", attrs: {}, children: [], parent: null };
  let cur = root;
  html = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<!doctype[^>]*>/i, "");
  const tok = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g;
  let m;
  while ((m = tok.exec(html))) {
    if (m[4] !== undefined) { cur.children.push({ text: decode(m[4]) }); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      let n = cur;
      while (n && n.tag !== tag) n = n.parent;
      if (n && n.parent) cur = n.parent;
      continue;
    }
    const attrs = {};
    for (const a of m[3].matchAll(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
      attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? "");
    const el = { tag, attrs, children: [], parent: cur };
    cur.children.push(el);
    if (tag === "script" || tag === "style") {
      const end = html.indexOf("</" + tag, tok.lastIndex);
      tok.lastIndex = end < 0 ? html.length : end;
      continue;
    }
    if (!VOID.has(tag) && !m[3].trim().endsWith("/")) cur = el;
  }
  return root;
}

const hiddenFromAT = (el) => el.attrs && el.attrs["aria-hidden"] === "true";

// Text a reader gets, with slots shown as {name}.
function textOf(el) {
  let out = "";
  for (const c of el.children) {
    if (c.text !== undefined) { out += c.text; continue; }
    if (hiddenFromAT(c) || c.tag === "script" || c.tag === "style") continue;
    const slot = c.attrs["data-stat"] || c.attrs["data-run"] || c.attrs["data-res"];
    if (slot) out += "{" + slot + "}";
    else if (c.tag === "br") out += " ";
    else out += textOf(c);
  }
  return out;
}

function* walk(el) {
  for (const c of el.children || []) {
    if (c.text !== undefined) continue;
    yield c;
    yield* walk(c);
  }
}

const find = (root, tag) => { for (const e of walk(root)) if (e.tag === tag) return e; return null; };

function checkPage(page, facts, html = read(path.join(SITE, page))) {
  const where = page;
  const root = parseHtml(html);
  const body = find(root, "body") || root;

  // Numbers in text outside any data-fact element.
  (function stray(el, inFact) {
    for (const c of el.children) {
      if (c.text !== undefined) {
        if (!inFact && /\d/.test(c.text)) fail(where, "number outside data-fact: \"" + norm(c.text).slice(0, 70) + "\"");
        continue;
      }
      if (hiddenFromAT(c) || c.tag === "script" || c.tag === "style") continue;
      stray(c, inFact || "data-fact" in c.attrs);
    }
  })(body, false);

  for (const el of walk(body)) {
    if (hiddenFromAT(el)) continue;
    const ids = (el.attrs["data-fact"] || "").split(/\s+/).filter(Boolean);
    const quotes = [];
    for (const id of ids) {
      if (!facts.has(id)) fail(where, "<" + el.tag + "> data-fact " + id + " is not in FACTS.md");
      else quotes.push(norm(facts.get(id).page));
    }
    const ok = (t) => quotes.includes(t) || (quotes.length > 1 && quotes.join(" ") === t);
    const label = "<" + el.tag + (ids.length ? " " + ids.join(" ") : "") + ">";

    const t = norm(textOf(el));
    if (ids.length && t && quotes.length === ids.length && !ok(t))
      fail(where, label + " text does not match FACTS.md: \"" + t.slice(0, 80) + "\"");
    if (el.tag === "figcaption" && t && !ids.length) fail(where, "<figcaption> without data-fact: \"" + t.slice(0, 60) + "\"");

    for (const a of ["aria-label", "alt", "title"]) {
      if (!(a in el.attrs)) continue;
      const v = norm(el.attrs[a]);
      if (CONTROLS.has(el.tag)) {
        if (/\d/.test(v)) fail(where, label + " " + a + " holds a number: \"" + v + "\"");
        continue;
      }
      if (!ids.length) fail(where, label + " " + a + " without data-fact: \"" + v + "\"");
      else if (quotes.length === ids.length && !ok(v)) fail(where, label + " " + a + " does not match FACTS.md: \"" + v + "\"");
    }
  }
  return root;
}

// A data-res slot names a path in results.json; its static text must be what the script would write.
function checkResSlots(page, root) {
  let data = null, lib = null;
  for (const el of walk(root)) {
    const p = el.attrs["data-res"];
    if (p === undefined) continue;
    data = data || resultsData();
    lib = lib || resultsLib();
    const v = lib.get(data, p);
    if (v === undefined) { fail(page, "data-res " + p + " is not in results.json"); continue; }
    const want = lib.fmt(v, el.attrs["data-fixed"] ?? null, el.attrs["data-k"] ?? null);
    const shown = norm(el.children.map((c) => c.text ?? "").join(""));
    if (shown !== want) fail(page, "data-res " + p + " shows \"" + shown + "\", results.json gives \"" + want + "\"");
  }
}

// Strings in the results scripts that carry a figure would bypass the ledger; numbers come from the data file.
function checkResultsScripts() {
  for (const f of fs.readdirSync(RESULTS).filter((n) => n.endsWith(".js") && !["results.js", "page.js"].includes(n))) {
    read(path.join(RESULTS, f)).split("\n").forEach((l, i) => {
      for (const [, s] of l.matchAll(/"((?:[^"\\]|\\.)*)"/g))
        if (/[a-z]{3}/i.test(s) && /\d/.test(s) && !/[<=>]/.test(s) && !/^[\w-]+$/.test(s)) fail("media/results/" + f + ":" + (i + 1), "a string with a figure: \"" + s + "\"");
    });
  }
}

// Copy written by app.js: a data-fact set in code, then the text on the next line.
function checkScriptCopy(facts) {
  const file = path.join(SITE, "app.js");
  if (!fs.existsSync(file)) return;
  const lines = read(file).split("\n");
  lines.forEach((l, i) => {
    const m = l.match(/setAttribute\("data-fact", "(F\d+)"\)/);
    if (!m) return;
    const where = "app.js:" + (i + 1);
    const row = facts.get(m[1]);
    if (!row) return fail(where, m[1] + " is not in FACTS.md");
    const next = lines[i + 1] || "";
    if (!/textContent\s*=/.test(next)) return fail(where, "data-fact set without textContent on the next line");
    const quote = norm(row.page);
    for (const [, s] of next.matchAll(/"((?:[^"\\]|\\.)*)"/g))
      if (norm(s) && !quote.includes(norm(s))) fail(where, "\"" + s + "\" is not in " + m[1] + "'s page quote");
  });
}

// ---- git figures and the build log -------------------------------------------------------

function loadRun() {
  const ctx = {};
  vm.runInNewContext(read(path.join(SITE, "runstats.js")), ctx);
  if (!ctx.crRun) throw new Error("runstats.js defines no crRun");
  return ctx.crRun;
}

const hasTags = () => {
  try {
    for (const tag of ["site-v5-base", "site-v5"]) execFileSync("git", ["rev-parse", "--verify", "-q", tag + "^{commit}"], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch { return false; }
};

// Outside the build repo (no site-v5 tags) the figures buildstats.mjs froze into crRun.git stand in for git.
function gitAtHead(run) {
  if (!hasTags()) {
    if (!run.git) throw new Error("no site-v5 tags and runstats.js has no frozen git figures");
    console.log("git     site-v5 tags absent: checking against crRun.git frozen by buildstats.mjs");
    const g = run.git;
    return { commits: String(g.commits), first: g.first, last: g.last, date: g.date };
  }
  const out = execFileSync("git", ["log", "site-v5-base..site-v5", "--grep", "^site:", "--format=%cI"], { cwd: ROOT, encoding: "utf8" });
  const lines = out.trim().split("\n").filter(Boolean);
  const n = lines.length;
  const head = { commits: String(n), first: n ? awst(lines[n - 1]) : "n/a", last: n ? awst(lines[0]) : "n/a", date: n ? awstDate(lines[0]) : "n/a" };
  if (run.git && ["commits", "first", "last", "date"].some((k) => String(run.git[k]) !== head[k]))
    fail("runstats.js", "crRun.git " + JSON.stringify(run.git) + " differs from git " + JSON.stringify(head) + " (rerun buildstats.mjs)");
  return head;
}

function checkGit(run, roots) {
  const head = gitAtHead(run);
  const want = run.source === "run" ? head : { commits: "n/a", first: "n/a", last: "n/a", date: "n/a" };
  for (const [page, root] of roots) {
    for (const el of walk(root)) {
      const key = el.attrs["data-stat"];
      if (key in want && norm(textOf(el)) !== want[key])
        fail(page, "data-stat " + key + " reads \"" + norm(textOf(el)) + "\", expected \"" + want[key] + "\" (" +
          (run.source === "run" ? "git at HEAD" : "fixture: git slots read n/a") + ")");
      if ((el.attrs.class || "").split(/\s+/).includes("colophon") && run.source !== "run" && el.attrs["data-when"] !== "run")
        fail(page, "colophon is not hidden in fixture mode (needs data-when=\"run\")");
    }
  }
  if (run.source === "run" && String(run.totals.commits) !== head.commits)
    fail("runstats.js", "totals.commits " + run.totals.commits + ", git at HEAD has " + head.commits);

  const log = path.join(SITE, "changelog.html");
  if (!fs.existsSync(log)) { console.log("SKIP build log row count: changelog.html not written yet"); return; }
  const m = read(log).match(/<!-- buildlog:begin -->([\s\S]*?)<!-- buildlog:end -->/);
  if (!m) return fail("changelog.html", "no buildlog:begin / buildlog:end markers");
  const rows = (m[1].match(/<li\b/g) || []).length;
  if (String(rows) !== head.commits)
    fail("changelog.html", "build log has " + rows + " rows, git at HEAD has " + head.commits + " site: commits (run node site/buildlog.mjs)");
}

// ---- main --------------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const pages = args.length ? args.map((p) => path.basename(p)) : PAGES.filter((p) => fs.existsSync(path.join(SITE, p)));
  const facts = parseFacts(read(path.join(SITE, "FACTS.md")));
  for (const row of facts.values()) checkSources(row);
  const roots = pages.map((p) => [p, checkPage(p, facts)]);
  for (const [p, root] of roots) checkResSlots(p, root);
  checkResultsScripts();
  checkScriptCopy(facts);
  const run = loadRun();
  checkGit(run, roots);

  console.log("source  " + run.source + "   pages  " + pages.join(", ") + "   facts  " + facts.size);
  for (const f of fails) console.log("FAIL  " + f);
  console.log(fails.length ? fails.length + " failure(s)" : "ok   factcheck passed");
  process.exit(fails.length ? 1 : 0);
}

export { fails, parseFacts, checkSources, checkPage, checkGit, parseHtml, textOf, walk };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
