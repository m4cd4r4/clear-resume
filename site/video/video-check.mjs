// video-check.mjs: gates for the results video, same spirit as factcheck/copycheck for the pages.
// Usage: node site/video/video-check.mjs
// Fails on: a digit in composition text outside a data-res slot (figures come from results.json) unless the
// text is a data-lit literal that also appears in FACTS.md or index.html; a data-res path that does not
// resolve; the copycheck wording rules; and --bg/--text/... tokens that differ from styles.css.
// It also refreshes site/video/assets (a copy of the page's chart files, see build.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHtml, walk } from "../factcheck.mjs";
import { checkText, fails as copyFails } from "../copycheck.mjs";
import { build } from "./build.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(HERE, "..");
const fails = [];
const fail = (where, msg) => fails.push(where + ": " + msg);
const read = (p) => fs.readFileSync(p, "utf8");
const norm = (s) => s.replace(/\s+/g, " ").trim();

const html = read(path.join(HERE, "index.html"));
const data = JSON.parse(read(path.join(SITE, "media", "results", "results.json")));
const facts = read(path.join(SITE, "FACTS.md")) + "\n" + read(path.join(SITE, "index.html"));
const get = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);

// 1. composition text
const root = parseHtml(html);
let body = null;
for (const el of walk(root)) if (el.tag === "body") { body = el; break; }
const slots = [];
const lits = [];
function text(el, inSlot) {
  let out = "";
  for (const c of el.children) {
    if (c.text !== undefined) { if (!inSlot) out += c.text; continue; }
    if (c.tag === "script" || c.tag === "style") continue;
    if (c.attrs["data-res"] !== undefined) { slots.push(c.attrs["data-res"]); out += " SLOT "; continue; }
    if (c.attrs["data-lit"] !== undefined) {
      const lit = norm(text(c, false));
      lits.push(lit);
      out += " LIT ";
      continue;
    }
    out += " " + text(c, inSlot) + " ";
  }
  return out;
}
const visible = norm(text(body, false));
if (/\d/.test(visible)) fail("index.html", "digit outside a data-res slot or data-lit literal: \"" + visible.match(/.{0,30}\d.{0,30}/)[0] + "\"");
for (const p of new Set(slots)) if (get(data, p) === undefined) fail("index.html", "data-res path not in results.json: " + p);
for (const l of lits) if (!facts.includes(l)) fail("index.html", "data-lit literal not found in FACTS.md or index.html: \"" + l + "\"");
for (const ch of ["—", "–", "…"]) if (html.includes(ch)) fail("index.html", "banned character U+" + ch.charCodeAt(0).toString(16));
checkText("video text", visible.replace(/\b(SLOT|LIT)\b/g, "x"));
copyFails.forEach((f) => fail("copy", f));

// 2. tokens match styles.css
const css = read(path.join(SITE, "styles.css"));
for (const name of ["bg", "surface", "hairline", "text", "text-2", "ghost", "ghost-text"]) {
  const re = new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{3,8})");
  const a = css.match(re), b = html.match(re);
  if (!a || !b) fail("tokens", "--" + name + " missing in " + (a ? "video" : "styles.css"));
  else if (a[1].toLowerCase() !== b[1].toLowerCase()) fail("tokens", "--" + name + " is " + b[1] + " in the video, " + a[1] + " in styles.css");
}

// 3. refresh the assets folder so a render always reads the page's current files
build();

for (const f of fails) console.log("FAIL  " + f);
console.log(fails.length ? fails.length + " failure(s)" : "ok   video-check passed (" + slots.length + " slots, " + lits.length + " literals)");
process.exit(fails.length ? 1 : 0);
