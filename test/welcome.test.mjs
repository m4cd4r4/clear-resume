// tdd-guard:allow - the notice's rules, each mutation-checked.
// The one-time notice that says Cornerman clears by itself.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { welcomeLine, withWelcome } from "../plugin/scripts/lib/welcome.mjs";

const OPTION = "CLAUDE_PLUGIN_OPTION_RELAY";
const NUDGE = "CLAUDE_PLUGIN_OPTION_AUTO_NUDGE";

let root, env;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cr-welcome-"));
  env = { CORNERMAN_HOME: root };
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("welcomeLine", () => {
  it("names the default 3 clears when the option is unset", () => {
    expect(welcomeLine(env)).toContain("up to 3 clears per window");
  });

  it("follows the number the user set", () => {
    expect(welcomeLine({ ...env, [OPTION]: "10" })).toContain("up to 10 clears per window");
  });

  it("says clear, not clears, for 1", () => {
    expect(welcomeLine({ ...env, [OPTION]: "1" })).toContain("up to 1 clear per window");
  });

  it("names no number when unlimited", () => {
    const line = welcomeLine({ ...env, [OPTION]: "unlimited" });
    expect(line).toContain("with no limit on clears");
    expect(line).not.toMatch(/up to \d/);
  });

  it("says the off command covers this window only", () => {
    expect(welcomeLine(env)).toContain("/relay off to stop it in this window");
  });

  it("has nothing to say when the relay is off", () => {
    expect(welcomeLine({ ...env, [OPTION]: "off" })).toBeNull();
  });

  it("has nothing to say when the nudge is off, because nothing then starts a clear", () => {
    expect(welcomeLine({ ...env, [NUDGE]: "false" })).toBeNull();
  });

  it("has nothing to say under the headless runner", () => {
    expect(welcomeLine({ ...env, CORNERMAN_HEADLESS: "1" })).toBeNull();
  });
});

describe("withWelcome", () => {
  it("builds an output when the hook had nothing else to say", () => {
    const out = withWelcome(null, { env });
    expect(out.systemMessage).toContain("up to 3 clears");
    expect(out.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(out.hookSpecificOutput.additionalContext).toContain("up to 3 clears");
  });

  it("keeps a loaded handover ahead of the notice", () => {
    const loaded = { systemMessage: "loaded", hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "the handover" } };
    const out = withWelcome(loaded, { env });
    expect(out.systemMessage.startsWith("loaded\n")).toBe(true);
    expect(out.hookSpecificOutput.additionalContext.startsWith("the handover")).toBe(true);
    expect(out.hookSpecificOutput.additionalContext).toContain("up to 3 clears");
  });

  it("shows once: the mark is written only after the output is out", () => {
    const first = withWelcome(null, { env });
    expect(withWelcome(null, { env })).not.toBeNull();
    first.afterOutput();
    expect(existsSync(join(root, ".welcomed"))).toBe(true);
    expect(withWelcome(null, { env })).toBeNull();
  });

  it("still runs the output's own afterOutput, and keeps it out of the JSON", () => {
    let ran = false;
    const loaded = { systemMessage: "loaded", hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "x" } };
    Object.defineProperty(loaded, "afterOutput", { value: () => { ran = true; }, enumerable: false });
    const out = withWelcome(loaded, { env });
    out.afterOutput();
    expect(ran).toBe(true);
    expect(JSON.parse(JSON.stringify(out)).afterOutput).toBeUndefined();
  });

  it("leaves the output alone when there is nothing to say", () => {
    const loaded = { systemMessage: "loaded" };
    expect(withWelcome(loaded, { env: { ...env, [OPTION]: "off" } })).toBe(loaded);
    expect(withWelcome(null, { env: { ...env, [OPTION]: "off" } })).toBeNull();
  });
});
