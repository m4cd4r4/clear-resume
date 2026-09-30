// /clear-resume:auto sets how many times this VS Code window may continue itself.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAuto } from "../plugin/scripts/lib/auto.mjs";
import { readBudget } from "../plugin/packages/store/autobudget.mjs";

let home;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "cr-auto-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const win = { pid: "16352", start: 1000 };
const vscodeEnv = () => ({ CLEAR_RESUME_HOME: home, CLAUDE_CODE_ENTRYPOINT: "claude-vscode" });

describe("the /clear-resume:auto command file", () => {
  it("runs auto.mjs with the arguments, and grants exactly that script", () => {
    const md = readFileSync(join(import.meta.dirname, "..", "plugin", "commands", "auto.md"), "utf8").replace(/\r\n/g, "\n");
    const grant = md.match(/^allowed-tools: Bash\((.*)\)$/m)[1];
    expect(grant).toBe('node "${CLAUDE_PLUGIN_ROOT}/scripts/auto.mjs" *');
    expect(md).toContain('!`node "${CLAUDE_PLUGIN_ROOT}/scripts/auto.mjs" $ARGUMENTS`');
  });
});

describe("runAuto", () => {
  it("sets this window's budget and says what it now is", () => {
    const out = runAuto(["4"], { env: vscodeEnv(), win });
    expect(out).toMatchObject({ ok: true });
    expect(out.text).toContain("auto: 4 of 4 left");
    expect(readBudget(home, win)).toMatchObject({ budget: 4, left: 4 });
  });

  it("refuses outside VS Code, where nothing would open the next conversation", () => {
    const out = runAuto(["on"], { env: { CLEAR_RESUME_HOME: home, CLAUDE_CODE_ENTRYPOINT: "cli" }, win });
    expect(out).toMatchObject({ ok: false });
    expect(out.text).toMatch(/VS Code/);
    expect(readBudget(home, win)).toBeNull();
  });
});
