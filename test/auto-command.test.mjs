// /clear-resume:auto sets how many times this VS Code window may continue itself.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { interactiveAuto, runAuto } from "../plugin/scripts/lib/auto.mjs";
import { readBudget, setBudget } from "../plugin/packages/store/autobudget.mjs";

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

describe("interactiveAuto", () => {
  // A save in a nudged VS Code session, in a window with budget left, is an auto one.
  const nudged = (env, id = "Sess-1") => {
    mkdirSync(join(home, ".nudged"), { recursive: true });
    writeFileSync(join(home, ".nudged", "sess-1"), "x");
    return { ...env, CLAUDE_CODE_SESSION_ID: id };
  };

  it("stamps the window only when nudged, in VS Code, with budget left", () => {
    setBudget(home, win, 2);
    expect(interactiveAuto({ env: nudged(vscodeEnv()), win })).toEqual({ window: "16352@1000", budget: 2, surface: "panel" });
    expect(interactiveAuto({ env: { ...vscodeEnv(), CLAUDE_CODE_SESSION_ID: "other" }, win })).toBeUndefined();
    expect(interactiveAuto({ env: nudged({ ...vscodeEnv(), CLAUDE_CODE_ENTRYPOINT: "cli" }), win })).toBeUndefined();
    expect(interactiveAuto({ env: nudged({ ...vscodeEnv(), CLEAR_RESUME_HEADLESS: "1" }), win })).toBeUndefined();
    setBudget(home, win, 0);
    expect(interactiveAuto({ env: nudged(vscodeEnv()), win })).toBeUndefined();
    setBudget(home, win, "unlimited");
    expect(interactiveAuto({ env: nudged(vscodeEnv()), win })).toEqual({ window: "16352@1000", budget: -1, surface: "panel" });
  });

  it("counts a terminal the extension opened (CLEAR_RESUME_WINDOW set) as inside VS Code", () => {
    setBudget(home, win, 2);
    const terminal = nudged({ ...vscodeEnv(), CLAUDE_CODE_ENTRYPOINT: "cli", CLEAR_RESUME_WINDOW: "16352@1000" });
    expect(interactiveAuto({ env: terminal, win })).toMatchObject({ window: "16352@1000", budget: 2 });
  });

  it("records the surface the session ran on, so the extension can continue on the same one", () => {
    setBudget(home, win, 2);
    expect(interactiveAuto({ env: nudged({ ...vscodeEnv(), CLAUDE_CODE_ENTRYPOINT: "cli", CLEAR_RESUME_WINDOW: "16352@1000" }), win }).surface).toBe("terminal");
    expect(interactiveAuto({ env: nudged(vscodeEnv()), win }).surface).toBe("panel");
  });

  it("records the terminal id the extension gave the session, so it closes that terminal and no other", () => {
    setBudget(home, win, 2);
    const env = { ...vscodeEnv(), CLAUDE_CODE_ENTRYPOINT: "cli", CLEAR_RESUME_WINDOW: "16352@1000" };
    expect(interactiveAuto({ env: nudged({ ...env, CLEAR_RESUME_TERMINAL: "t-1" }), win }).terminal).toBe("t-1");
    expect(interactiveAuto({ env: nudged(env), win })).not.toHaveProperty("terminal");
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
