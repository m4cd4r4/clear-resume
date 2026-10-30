// The idle handover is asked for while nobody is at the keyboard. In a profile that
// has not allowed the handover skill, the Skill call waits on "Use skill
// /clear-resume:handover?" and nothing is saved (rig run, 2026-10-30). The relay now
// leaves a one-shot mark when it asks, and the PreToolUse hook allows that one call.
// Everything else goes through the user's permissions as before.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = join(import.meta.dirname, "../plugin/scripts/pre-tool.mjs");
const ENTRY = join(import.meta.dirname, "../plugin/scripts/hook-entry.cjs");
const SESSION ="814f3f5c-1111-2222-3333-444455556666";

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cr-pre-tool-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function ask(at = Date.now(), session = SESSION) {
  const dir = join(root, ".asked");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, session), JSON.stringify({ at }));
}

function run(input, script = [SCRIPT]) {
  const out = execFileSync(process.execPath, script, {
    input: JSON.stringify(input),
    env: { ...process.env, CLEAR_RESUME_HOME: root },
    encoding: "utf8",
  });
  return out ? JSON.parse(out) : null;
}

const skillCall = (skill = "clear-resume:handover", session = SESSION) => ({
  hook_event_name: "PreToolUse",
  session_id: session,
  tool_name: "Skill",
  tool_input: { skill },
});

describe("pre-tool hook", () => {
  it("allows the handover skill the relay just asked for", () => {
    ask();
    const out = run(skillCall());
    expect(out.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(out.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  // tdd-guard:allow - the refusals below were added after the allow path passed;
  // each was seen to fail by removing the check it guards (PR evidence).
  it("allows it once: the mark is used up", () => {
    ask();
    run(skillCall());
    expect(existsSync(join(root, ".asked", SESSION))).toBe(false);
    expect(run(skillCall())).toBeNull();
  });

  it("says nothing when the relay did not ask", () => {
    expect(run(skillCall())).toBeNull();
  });

  it("says nothing for a stale ask", () => {
    ask(Date.now() - 16 * 60_000);
    expect(run(skillCall())).toBeNull();
  });

  it("says nothing for another session's ask", () => {
    ask(Date.now(), "other-session");
    expect(run(skillCall())).toBeNull();
  });

  it("says nothing for any other skill or tool, and keeps the mark", () => {
    ask();
    expect(run(skillCall("handover"))).toBeNull();
    expect(run(skillCall("someone-else:handover"))).toBeNull();
    expect(run({ ...skillCall(), tool_name: "Bash", tool_input: { command: "rm -rf /" } })).toBeNull();
    expect(existsSync(join(root, ".asked", SESSION))).toBe(true);
  });

  it("exits 0 with no output on bad input", () => {
    const out = execFileSync(process.execPath, [SCRIPT], { input: "not json", env: { ...process.env, CLEAR_RESUME_HOME: root }, encoding: "utf8" });
    expect(out).toBe("");
  });

  it("runs through hook-entry.cjs", () => {
    ask();
    const out = run(skillCall(), [ENTRY, "pre-tool"]);
    expect(out.hookSpecificOutput.permissionDecision).toBe("allow");
  });
});
