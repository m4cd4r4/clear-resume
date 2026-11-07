// Screenshots of the Handovers sidebar scrolled down, to show the search box staying at the top
// (docs/CLAUDE-TODO.md item 11). Renders the real pageHtml from extension/src/sidebar-page.ts with a
// fixture model in Playwright's bundled Chromium: headless, no profile, no logins.
//
//   node docs/research/ux-polish/shoot.mjs
//
// Needs `playwright` resolvable from here (it is not a dependency of this repo) and its Chromium.
// Writes sidebar-300.png and sidebar-500.png next to this file and prints the measurements.
import { build } from "../../../extension/node_modules/esbuild/lib/main.js";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, ".page.mjs");
await build({ entryPoints: [join(here, "../../../extension/src/sidebar-page.ts")], outfile: out, format: "esm", bundle: true, platform: "node", logLevel: "error" });
const { pageHtml } = await import(pathToFileURL(out).href);

// VS Code's Dark Modern sidebar colours, so the bar's background has something real to match.
const theme = `
html { --vscode-foreground: #cccccc; --vscode-descriptionForeground: #9d9d9d; --vscode-sideBar-background: #181818;
  --vscode-input-background: #313131; --vscode-input-foreground: #cccccc; --vscode-input-border: #3c3c3c;
  --vscode-input-placeholderForeground: #989898; --vscode-focusBorder: #0078d4; --vscode-list-hoverBackground: #2a2d2e;
  --vscode-font-family: "Segoe UI", system-ui, sans-serif; } body { background: #181818; }`;
const stub = `window.acquireVsCodeApi = () => ({ getState: () => ({}), setState() {}, postMessage() {} });`;

const titles = ["Cart totals rounding", "Search empty state", "Bump the test runner", "Checkout copy", "Invoice export", "Retry on 429",
  "Login redirect loop", "Dark mode tokens", "Image upload size", "Order history paging", "Webhook signature", "Price table layout"];
const row = (i, kind) => ({
  key: `h:${kind}:${i}`, id: `${kind}${i}`, kind, title: titles[i % titles.length], meta: `widget-shop · fix/item-${i}`,
  age: `${i + 1}h`, fade: kind === "waiting" ? 1 : 0.5, peek: ["Next: run the cart tests."], compact: false, pinned: i === 0,
});
const model = {
  section: "handovers", query: "",
  sections: [
    { id: "waiting", label: "Waiting", rows: Array.from({ length: 14 }, (_, i) => row(i, "waiting")) },
    { id: "archived", label: "Archived", rows: Array.from({ length: 14 }, (_, i) => row(i, "archived")) },
  ],
};

const html = pageHtml("n0nce", "'self'")
  .replace("</style>", `${theme}</style><script nonce="n0nce">${stub}</script>`)
  .replace("<body>", `<body class="vscode-dark">`);

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [300, 500]) {
    const page = await browser.newPage({ viewport: { width, height: 420 }, deviceScaleFactor: 2 });
    await page.setContent(html);
    await page.evaluate((m) => window.postMessage({ type: "model", json: JSON.stringify(m) }, "*"), model);
    await page.waitForSelector(".row");
    const box = () => page.evaluate(() => { const r = document.querySelector(".search").getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width }; });
    const before = await box();
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(100);
    const after = await box();
    // What is drawn in the bar's 8px band above the box, and just left of it: the bar, not a row.
    const under = await page.evaluate(() => [[40, 3], [3, 20]].map(([x, y]) => document.elementFromPoint(x, y)?.className));
    const scrolled = await page.evaluate(() => window.scrollY);
    const file = join(here, `sidebar-${width}.png`);
    await page.screenshot({ path: file });
    console.log(JSON.stringify({ width, scrolled, before, after, under, file }));
    await page.close();
  }
} finally {
  await browser.close();
  rmSync(out, { force: true });
}
