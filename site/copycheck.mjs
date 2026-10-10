// copycheck.mjs: copy rules from TASK.md that are about wording, not facts.
// Usage: node site/copycheck.mjs [page.html ...]   (default: every page of the three that exists; word cap on index.html only)
// Fails on: em dash, en dash or ellipsis character; "not just"; "not X, but Y"; a grading
// adjective next to a number; more than 250 visible words on index.html.
// Covers the pages, FACTS.md page quotes and the strings in app.js (script-written copy).
// Exits 1 on any FAIL.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHtml, walk } from "./factcheck.mjs";

const SITE = path.dirname(fileURLToPath(import.meta.url));
const MAX_WORDS = 250;
const BANNED_CHARS = [["—", "em dash"], ["–", "en dash"], ["…", "ellipsis character"]];
const GRADING = ["only", "just", "mere", "merely", "massive", "huge", "tiny", "healthy", "whopping",
  "impressive", "staggering", "incredible", "remarkable", "astonishing", "excellent", "solid"];
// Text inside these does not count toward the word cap (TASK.md: pre, code, svg, aria-hidden),
// and neither does the body of a closed <details> (not visible until opened).
const UNCOUNTED = new Set(["pre", "code", "svg", "script", "style"]);

const fails = [];
const fail = (where, msg) => fails.push(where + ": " + msg);
const norm = (s) => s.replace(/\s+/g, " ").trim();
const read = (p) => fs.readFileSync(p, "utf8");

function checkText(where, text) {
  for (const [ch, name] of BANNED_CHARS)
    if (text.includes(ch)) fail(where, name + " in \"" + norm(text).slice(0, 70) + "\"");
  const t = norm(text);
  if (/\bnot just\b/i.test(t)) fail(where, "\"not just\" in \"" + t.slice(0, 70) + "\"");
  const nb = t.match(/\bnot\b[^.;:]{1,60}?,\s*but\b/i);
  if (nb) fail(where, "\"not X, but Y\" in \"" + nb[0] + "\"");
  const words = t.split(" ");
  words.forEach((w, i) => {
    if (!GRADING.includes(w.toLowerCase().replace(/[^a-z]/g, ""))) return;
    const near = words.slice(Math.max(0, i - 2), i + 3).join(" ");
    if (/\d/.test(near)) fail(where, "grading word \"" + w + "\" next to a number: \"" + near + "\"");
  });
}

// Visible words of the body for one crRun.source mode.
function visibleText(el, mode) {
  let out = "";
  for (const c of el.children) {
    if (c.text !== undefined) { out += c.text; continue; }
    if (UNCOUNTED.has(c.tag) || c.attrs["aria-hidden"] === "true") continue;
    if (c.attrs["data-when"] && c.attrs["data-when"] !== mode) continue;
    // A closed <details> shows only its summary until the reader opens it.
    if (el.tag === "details" && !("open" in el.attrs) && c.tag !== "summary") continue;
    out += " " + visibleText(c, mode) + " ";
  }
  return out;
}

function checkPage(page) {
  const html = read(path.join(SITE, page));
  const root = parseHtml(html);
  let body = null;
  for (const el of walk(root)) if (el.tag === "body") { body = el; break; }
  body = body || root;

  for (const [ch, name] of BANNED_CHARS) if (html.includes(ch)) fail(page, name + " in the file");
  // Phrase checks per mode, so text from the two data-when states is never joined.
  for (const mode of ["fixture", "run"]) checkText(page + " (" + mode + ")", visibleTextAll(body, mode));
  for (const el of walk(body))
    for (const a of ["aria-label", "alt", "title"]) if (a in el.attrs) checkText(page + " <" + el.tag + "> " + a, el.attrs[a]);

  if (page !== "index.html") return;
  for (const mode of ["fixture", "run"]) {
    const n = norm(visibleText(body, mode)).split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    console.log("words  index.html (" + mode + ")  " + n + " / " + MAX_WORDS);
    if (n > MAX_WORDS) fail(page, n + " visible words in " + mode + " mode, the cap is " + MAX_WORDS);
  }
}

// Every text a reader gets in one mode, pre and code included (only the word cap leaves them out).
function visibleTextAll(el, mode) {
  let out = "";
  for (const c of el.children) {
    if (c.text !== undefined) { out += c.text; continue; }
    if (c.tag === "script" || c.tag === "style" || c.attrs["aria-hidden"] === "true") continue;
    if (c.attrs["data-when"] && c.attrs["data-when"] !== mode) continue;
    // A build log subject is a git commit message quoted as a value (buildlog.mjs), not page copy.
    // Its characters are still checked over the whole file above.
    if (c.attrs["data-run"] === "subject") continue;
    out += " " + visibleTextAll(c, mode) + " ";
  }
  return out;
}

function checkFacts() {
  for (const line of read(path.join(SITE, "FACTS.md")).split("\n")) {
    const m = line.match(/^(F\d+) \| page: "(.*?)"(?= \| )/);
    if (m) checkText("FACTS.md " + m[1], m[2].replace(/\\"/g, "\""));
  }
}

function checkScript() {
  const res = path.join(SITE, "media", "results");
  const files = ["app.js", ...(fs.existsSync(res) ? fs.readdirSync(res).filter((f) => f.endsWith(".js")).map((f) => "media/results/" + f) : [])];
  for (const f of files) {
    const file = path.join(SITE, f);
    if (!fs.existsSync(file)) continue;
    read(file).split("\n").forEach((l, i) => {
      for (const [, s] of l.matchAll(/"((?:[^"\\]|\\.)*)"/g)) if (/[a-z] [a-z]/i.test(s)) checkText(f + ":" + (i + 1), s);
      for (const [ch, name] of BANNED_CHARS) if (l.includes(ch)) fail(f + ":" + (i + 1), name);
    });
  }
}

function main() {
  const args = process.argv.slice(2);
  const pages = args.length ? args.map((p) => path.basename(p))
    : ["index.html", "replay-archive.html", "how-it-works.html", "changelog.html"].filter((p) => fs.existsSync(path.join(SITE, p)));
  for (const p of pages) checkPage(p);
  checkFacts();
  checkScript();
  console.log("pages  " + pages.join(", "));
  for (const f of fails) console.log("FAIL  " + f);
  console.log(fails.length ? fails.length + " failure(s)" : "ok   copycheck passed");
  process.exit(fails.length ? 1 : 0);
}

export { checkText, fails };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
