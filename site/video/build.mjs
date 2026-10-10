// Copies the shared chart code, data, CSS and fonts into site/video/assets/ (gitignored). HyperFrames refuses
// "../" asset paths, so the composition reads assets/... and this script keeps that folder a verbatim copy of
// the page's own files. Run it before `hyperframes check`, `preview` or `render`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.join(here, "..");

export const COPIES = [
  ...["results.js", "results.json", "charts-core.js", "chart-race.js", "chart-dots.js", "chart-specs.js", "results.css"]
    .map((f) => [path.join(site, "media", "results", f), path.join(here, "assets", "results", f)]),
  ...["jetbrains-mono-400.woff2", "jetbrains-mono-700.woff2", "montserrat-400.woff2", "montserrat-600.woff2", "montserrat-700.woff2"]
    .map((f) => [path.join(site, "fonts", f), path.join(here, "assets", "fonts", f)]),
];

export function build() {
  for (const [from, to] of COPIES) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  return COPIES.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log("copied " + build() + " files into site/video/assets");
