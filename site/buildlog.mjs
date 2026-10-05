// buildlog.mjs: writes the build log on changelog.html from git, between the buildlog markers.
// Usage: node site/buildlog.mjs
// Rows: every site: commit since site-v5-base, oldest first, as short sha, AWST time and subject.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SITE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(SITE);
const PAGE = path.join(SITE, "changelog.html");
const BEGIN = "<!-- buildlog:begin -->";
const END = "<!-- buildlog:end -->";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const when = (iso) => {
  const d = new Date(Date.parse(iso) + 8 * 3600e3); // AWST is UTC+8
  const hm = String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
  return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + hm;
};
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const out = execFileSync("git", ["log", "site-v5-base..site-v5", "--grep", "^site:", "--reverse", "--format=%h%x09%cI%x09%s"],
  { cwd: ROOT, encoding: "utf8" });
const rows = out.split("\n").filter(Boolean).map((line) => {
  const [sha, iso, subject] = line.split("\t");
  return '          <li data-fact="F245"><code data-run="sha">' + sha + '</code> <span class="bl-when" data-run="when">' +
    when(iso) + '</span> <span class="bl-subj" data-run="subject">' + esc(subject).replace(/^site: [^.]+\./, '<span class="bl-item">$&</span>') + "</span></li>";
});

const html = fs.readFileSync(PAGE, "utf8");
const a = html.indexOf(BEGIN), b = html.indexOf(END);
if (a < 0 || b < a) throw new Error("buildlog markers missing in changelog.html");
fs.writeFileSync(PAGE, html.slice(0, a + BEGIN.length) + "\n" + rows.join("\n") + "\n          " + html.slice(b));
console.log("buildlog " + rows.length + " site: commits written");
