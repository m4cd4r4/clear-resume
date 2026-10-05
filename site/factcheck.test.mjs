// factcheck.test.mjs: proves factcheck.mjs passes a known-good case and catches each known-bad one.
// Usage: node site/factcheck.test.mjs
import { fails, parseFacts, checkSources, checkPage, checkGit, parseHtml } from "./factcheck.mjs";

const OFF = "They belong to the nudge and the relay, which are both off by default.";
const RELAY = "It needs Claude Code 2.1.275 or later, and works in a terminal and in the VS Code chat panel.";
const ledger = [
  `F1 | page: "Off by default." | source: "${OFF}" | README.md:123`,
  `F2 | page: "Needs 2.1.300 or later." | source: "${RELAY}" | README.md:87`,
  `F3 | page: "The relay always works." | source: "${RELAY}" | README.md:87`,
  `F4 | page: "x" | source: "This sentence is not in the README at all" | README.md:5`,
  `F5 | page: "Off by default." | source: "${OFF}" | README.md:40`,
  `F6 | page: "y" | source: "Monochrome terminal" | TASK.md: Look`,
  `F8 | page: "{sessions} sessions" | source: "const sessions = out.length;" | site/buildstats.mjs:127 | value: 9 (x, buildstats.mjs)`,
  `F9 | page: "A \\"quoted\\" 2.1.275" | source: "${RELAY}" | README.md:87`,
].join("\n");

let bad = 0;
function expect(name, run, want) {
  fails.length = 0;
  run();
  const got = fails.join("\n");
  const pass = want === null ? fails.length === 0 : fails.some((f) => f.includes(want));
  if (!pass) bad++;
  console.log((pass ? "ok   " : "FAIL ") + name + (pass ? "" : "\n     got: " + (got || "(no failures)")));
}

fails.length = 0;
const facts = parseFacts(ledger);
const one = (id) => () => checkSources(facts.get(id));

expect("good ledger line passes", one("F1"), null);
expect("slot quote with a value field passes", one("F8"), null);
expect("escaped quotes parse and pass", one("F9"), null);
expect("page number missing from source", one("F2"), "page shows 2.1.300");
expect("strong word missing from source", one("F3"), "page says \"always\"");
expect("quote not in the cited file", one("F4"), "quote not in README.md:5");
expect("quote at the wrong line", one("F5"), "not at README.md:40");
expect("TASK.md outside the Media box", one("F6"), "TASK.md is a source only for the Media box");

const page = (body) => () => checkPage("probe.html", facts, "<html><body>" + body + "</body></html>");
expect("good page passes", page(
  `<p data-fact="F1"><span aria-hidden="true">123</span>Off by default.</p>` +
  `<p data-fact="F8"><span data-stat="sessions">9</span> sessions</p>` +
  `<video aria-label="Off by default." data-fact="F1"></video><button aria-label="Pause replay">x</button>`), null);
expect("number outside data-fact", page(`<p>Needs 2.1.275 or later.</p>`), "number outside data-fact");
expect("text does not match its line", page(`<p data-fact="F1">Off by default!</p>`), "text does not match");
expect("id missing from FACTS.md", page(`<p data-fact="F77">x</p>`), "F77 is not in FACTS.md");
expect("aria-label without data-fact", page(`<video aria-label="A replay"></video>`), "aria-label without data-fact");
expect("aria-label does not match", page(`<video aria-label="A replay" data-fact="F1"></video>`), "aria-label does not match");
expect("alt without data-fact", page(`<img alt="A chart">`), "alt without data-fact");
expect("figcaption without data-fact", page(`<figure><figcaption>Cap</figcaption></figure>`), "<figcaption> without data-fact");
expect("number in a control label", page(`<button aria-label="Copy 2">x</button>`), "holds a number");

const git = (source, body) => () => checkGit({ source, totals: { commits: "n/a" }, git: { commits: 42, first: "07:36", last: "09:05", date: "5 Oct 2026" } }, [["probe.html", parseHtml(body)]]);
const colophon = (attrs, v) => `<p class="colophon"${attrs}><span data-stat="commits">${v}</span></p>`;
expect("fixture: git slot n/a, colophon hidden", git("fixture", colophon(' data-when="run"', "n/a")), null);
expect("fixture: git slot holds a figure", git("fixture", colophon(' data-when="run"', "12")), "expected \"n/a\"");
expect("fixture: colophon shown", git("fixture", colophon("", "n/a")), "colophon is not hidden");
expect("run: git slot differs from HEAD", git("run", colophon(' data-when="run"', "n/a")), "(git at HEAD)");

process.exit(bad ? 1 : 0);
