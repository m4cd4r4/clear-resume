// copycheck.test.mjs: proves each copycheck rule fails a bad line and passes a clean one.
// Usage: node site/copycheck.test.mjs
import { checkText, fails } from "./copycheck.mjs";

const cases = [
  ["em dash", "Clear the chat — keep the work.", true],
  ["en dash", "77k–99k", true],
  ["ellipsis", "Loading…", true],
  ["not just", "It is not just a summary.", true],
  ["not X, but Y", "It is not a summary, but a handover.", true],
  ["grading before a number", "It used only 97k tokens.", true],
  ["grading after a number", "A drop of 101k, massive.", true],
  ["clean sentence with a number", "191 /clear loads, median before 195k.", false],
  ["only, far from a number", "After compaction only this window's own handover loads.", false],
];

let bad = 0;
for (const [name, text, shouldFail] of cases) {
  fails.length = 0;
  checkText("test", text);
  const ok = (fails.length > 0) === shouldFail;
  if (!ok) bad++;
  console.log((ok ? "ok   " : "FAIL ") + name + (shouldFail ? " (should fail)" : " (should pass)"));
}
console.log(bad ? bad + " case(s) wrong" : "ok   all " + cases.length + " cases");
process.exit(bad ? 1 : 0);
