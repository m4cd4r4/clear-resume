// check.mjs: accessibility and no-external-requests checks for the site.
// Usage: node site/check.mjs [page.html ...]   (default: every page of the three that exists)
// Exits 1 on any FAIL.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHtml, textOf, walk } from "./factcheck.mjs";

const SITE = path.dirname(fileURLToPath(import.meta.url));
const PAGES = ["index.html", "how-it-works.html", "changelog.html"];
const SCRIPTS = ["app.js", "model.js", "runstats.js"];
const fails = [];
const fail = (where, msg) => fails.push(where + ": " + msg);
const read = (f) => fs.readFileSync(path.join(SITE, f), "utf8");
const norm = (s) => s.replace(/\s+/g, " ").trim();

// ---- colour: tokens, contrast, no hue -----------------------------------------------------

const lum = (hex) => {
  const c = hex.replace("#", "").match(/../g).map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Text colours on each ground they sit on; the inverted pair is a filled button or the skip link.
const PAIRS = [
  ["text", "bg"], ["text", "surface"], ["text-2", "bg"], ["text-2", "surface"],
  ["ghost-text", "bg"], ["ghost-text", "surface"], ["bg", "text"],
];
const TEXT_TOKENS = new Set(["text", "text-2", "ghost-text", "bg"]);

function checkCss() {
  const css = read("styles.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const root = css.match(/:root\s*\{([^}]*)\}/);
  if (!root) return fail("styles.css", "no :root block");
  const tok = {};
  for (const m of root[1].matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) tok[m[1]] = m[2].toLowerCase();
  for (const [name, hex] of Object.entries(tok)) {
    const [r, g, b] = hex.slice(1).match(/../g);
    if (!(r === g && g === b)) fail("styles.css", "--" + name + " " + hex + " has a hue");
  }
  for (const [fg, bg] of PAIRS) {
    if (!tok[fg] || !tok[bg]) { fail("styles.css", "missing token --" + (tok[fg] ? bg : fg)); continue; }
    const r = ratio(tok[fg], tok[bg]);
    console.log("contrast  --" + fg.padEnd(10) + " on --" + bg.padEnd(8) + r.toFixed(2) + ":1");
    if (r < 4.5) fail("styles.css", "--" + fg + " on --" + bg + " is " + r.toFixed(2) + ":1, under 4.5:1");
  }

  // Outside :root, colours come only from tokens (print may use a white ground: @media print is skipped).
  const body = css.replace(root[0], "").replace(/@media print\s*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, "");
  for (const m of body.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/gi)) fail("styles.css", "colour " + m[0] + " outside :root");
  for (const m of body.matchAll(/(?:^|[;{\s])(color|fill)\s*:\s*([^;}]+)/g)) {
    const v = m[2].trim();
    const t = v.match(/^var\(--([\w-]+)\)$/);
    if (t ? !TEXT_TOKENS.has(t[1]) : !/^(inherit|currentColor|transparent|none)$/i.test(v))
      fail("styles.css", m[1] + ": " + v + " is not a text token (ghost #5a5a5a is for strokes only)");
  }

  if (!/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--text\)/.test(css)) fail("styles.css", "no 2px --text :focus-visible outline");
  for (const m of css.matchAll(/([^{}]+)\{[^}]*outline:\s*(?:none|0)\b/g)) fail("styles.css", "outline removed on " + norm(m[1]));
  if (!/@media \(prefers-reduced-motion: reduce\)/.test(css)) fail("styles.css", "no prefers-reduced-motion block");
  if (/@import/.test(css) && /@import[^;]*(?:https?:|\/\/)/.test(css)) fail("styles.css", "external @import");
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)/g)) if (/^(?:https?:|\/\/)/.test(m[1])) fail("styles.css", "external url(" + m[1] + ")");
}

// ---- pages -------------------------------------------------------------------------------

const RESOURCE = { src: true, poster: true, srcset: true, data: true };

function checkPage(page) {
  const html = read(page);
  const root = parseHtml(html);
  const htmlEl = [...walk(root)].find((e) => e.tag === "html");
  if (!htmlEl || !htmlEl.attrs.lang) fail(page, "<html> has no lang");
  if (/<style[^>]*>[\s\S]*?@import/.test(html)) fail(page, "@import in an inline style");
  for (const m of html.matchAll(/style="[^"]*url\(\s*["']?(https?:|\/\/)/g)) fail(page, "external url() in a style attribute");

  let h1 = 0;
  for (const el of walk(root)) {
    const a = el.attrs;
    const name = norm(textOf(el)) || a["aria-label"] || (a["aria-labelledby"] ? "labelledby" : "");
    for (const k of Object.keys(RESOURCE)) if (a[k] && /(?:^|[\s,])(?:https?:|\/\/)/.test(a[k])) fail(page, "<" + el.tag + " " + k + "> loads " + a[k]);
    if (el.tag === "link" && /^(?:https?:|\/\/)/.test(a.href || "") && !/^(?:canonical|me|author)$/.test(a.rel || "")) fail(page, "<link> loads " + a.href);
    if (el.tag === "h1") h1++;
    if (el.tag === "img" && !("alt" in a)) fail(page, "<img src=\"" + a.src + "\"> has no alt");
    if (el.tag === "button" && !name) fail(page, "<button> has no accessible name");
    if (el.tag === "a" && !name) fail(page, "<a href=\"" + a.href + "\"> has no accessible name");
    if (el.tag === "video" && !a["aria-label"]) fail(page, "<video> has no aria-label");
    if (el.tag === "svg" && a["aria-hidden"] !== "true" && !a["aria-label"] && a.role !== "img") fail(page, "<svg> is neither hidden nor labelled");
    if (/^(input|select|textarea)$/.test(el.tag) && a.type !== "hidden" && !a["aria-label"] && !(a.id && html.includes("for=\"" + a.id + "\"")))
      fail(page, "<" + el.tag + "> has no label");
    if (a.tabindex && Number(a.tabindex) > 0) fail(page, "<" + el.tag + "> tabindex " + a.tabindex + " breaks keyboard order");
    if (/^(div|span|p|li)$/.test(el.tag) && Object.keys(a).some((k) => k.startsWith("on"))) fail(page, "<" + el.tag + "> has an inline click handler; use a button");
    if (el.tag === "details" && !el.children.some((c) => c.tag === "summary")) fail(page, "<details> without <summary>");
  }
  if (h1 !== 1) fail(page, h1 + " <h1> elements, expected 1");
  if (!html.includes("class=\"skip\"")) fail(page, "no skip link");
}

function checkScripts() {
  for (const f of SCRIPTS) {
    if (!fs.existsSync(path.join(SITE, f))) continue;
    const js = read(f);
    if (/\bfetch\s*\(|XMLHttpRequest|\bimport\s*\(|new\s+WebSocket|sendBeacon/.test(js)) fail(f, "makes a network request");
    for (const m of js.matchAll(/["'](https?:\/\/[^"']+)["']/g))
      if (m[1] !== "http://www.w3.org/2000/svg") fail(f, "external URL " + m[1]);
  }
  const app = fs.existsSync(path.join(SITE, "app.js")) ? read("app.js") : "";
  if (app && !/prefers-reduced-motion: reduce/.test(app)) fail("app.js", "never reads prefers-reduced-motion");
}

function main() {
  const args = process.argv.slice(2);
  const pages = args.length ? args.map((p) => path.basename(p)) : PAGES.filter((p) => fs.existsSync(path.join(SITE, p)));
  checkCss();
  for (const p of pages) checkPage(p);
  checkScripts();
  console.log("pages  " + pages.join(", "));
  for (const f of fails) console.log("FAIL  " + f);
  console.log(fails.length ? fails.length + " failure(s)" : "ok   check passed");
  process.exit(fails.length ? 1 : 0);
}

main();
