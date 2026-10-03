// Runs the relay mod's tests (test/mod/*.test.ts) under `claude plugin test`.
// The shipped plugin carries no tests (test/plugin-footprint.test.mjs), so this
// copies plugin/ into a scratch folder, puts the tests beside the module, and
// runs them there. Needs a Claude Code build with plugin modules on PATH.
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = resolve(import.meta.dirname, "..");
const dir = mkdtempSync(join(tmpdir(), "clear-resume-mod-"));
try {
  cpSync(join(REPO, "plugin"), dir, { recursive: true });
  for (const name of readdirSync(join(REPO, "test", "mod")).filter((n) => /\.test\.tsx?$/.test(n)))
    cpSync(join(REPO, "test", "mod", name), join(dir, "hooks", name));
  // One command string: claude is a .cmd shim on Windows, which needs a shell.
  const r = spawnSync(`claude plugin test "${dir}"`, { stdio: "inherit", shell: true });
  process.exitCode = r.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
