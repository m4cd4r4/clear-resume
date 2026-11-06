// npm test: run vitest, then judge the run by its results (lib/test-verdict.mjs).
// Arguments go through to vitest: npm test -- test/web.test.mjs
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verdict } from "./lib/test-verdict.mjs";

const VITEST = join(import.meta.dirname, "..", "node_modules", "vitest", "vitest.mjs");
const out = join(tmpdir(), `cornerman-vitest-${process.pid}.json`);
const args = [VITEST, "run", "--reporter=default", "--reporter=json", `--outputFile.json=${out}`, ...process.argv.slice(2)];
const child = spawn(process.execPath, args, { stdio: ["inherit", "pipe", "pipe"] });
let output = "";
for (const [from, to] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  from.on("data", (d) => {
    output += d;
    to.write(d);
  });
}
child.on("close", (code) => {
  const results = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
  rmSync(out, { force: true });
  const v = verdict({ code, results, output });
  if (v.note) console.log(`\nnpm test: ${v.pass ? "PASS" : "FAIL"}, ${v.note}`);
  process.exit(v.pass ? 0 : 1);
});
