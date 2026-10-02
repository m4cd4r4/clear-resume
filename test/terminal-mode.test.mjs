// Terminal mode (docs/AUTO-CONTINUE.md, "Phase 2b"): the extension continues a
// session in a terminal it opens, as `claude "<prompt>"`, which submits at once.
import { describe, expect, it } from "vitest";
import { cliTrusts, continueSurface, launchLine, safeForShell, terminalEnv, terminalToClose } from "../extension/src/terminal.ts";

describe("terminalEnv", () => {
  // E2E 2026-10-01: an inherited CLAUDE_CODE_CHILD_SESSION turned off the terminal
  // session's transcript, so the nudge never fired. null unsets a variable in
  // createTerminal; the four are the ones Claude Code's own extension deletes.
  it("carries the window and terminal ids and unsets the nested-session markers", () => {
    expect(terminalEnv("123@456", "t-1")).toEqual({
      CLEAR_RESUME_WINDOW: "123@456",
      CLEAR_RESUME_TERMINAL: "t-1",
      CLAUDECODE: null,
      CLAUDE_CODE_CHILD_SESSION: null,
      TRACEPARENT: null,
      TRACESTATE: null,
    });
  });
});

describe("cliTrusts", () => {
  // The CLI's own check (2.1.286): projects[<git root>].hasTrustDialogAccepted === true,
  // keyed exactly, no parent walk, no case folding. Untrusted means a prompt nobody sees.
  it("trusts only the exact folder key, written with forward slashes", () => {
    const json = { projects: { "I:/Scratch": { hasTrustDialogAccepted: true }, "I:/Scratch/repo": { hasTrustDialogAccepted: true } } };
    expect(cliTrusts(json, "I:\\Scratch\\repo")).toBe(true);
    expect(cliTrusts(json, "I:/Scratch/other")).toBe(false);
    expect(cliTrusts(json, "i:/Scratch/repo")).toBe(false);
  });
});

describe("launchLine", () => {
  it("starts claude with a one-line prompt that points at the handover file", () => {
    expect(launchLine("C:/Users/me/.clear-resume/loaded/repo-abc1234.md")).toBe(
      'claude "Continue from the clear-resume handover in C:/Users/me/.clear-resume/loaded/repo-abc1234.md. Read it in full first, then do its Next action."',
    );
  });
});

describe("safeForShell", () => {
  it("refuses a path holding a character pwsh, cmd or bash would treat specially", () => {
    expect(safeForShell("C:/Users/me/.clear-resume/loaded/repo-abc1234.md")).toBe(true);
    expect(safeForShell("C:/Users/Jo Smith/.clear-resume/loaded/a.md")).toBe(true);
    for (const c of ['"', "$", "`", "%", "^", "&", "|", "<", ">", "!"]) {
      expect(safeForShell(`C:/Users/a${c}b/x.md`)).toBe(false);
    }
  });
});

describe("continueSurface", () => {
  it("'same' follows the record's surface, a missing one reads as panel, and the setting overrides", () => {
    expect(continueSurface("same", { surface: "terminal" })).toBe("terminal");
    expect(continueSurface("same", { surface: "panel" })).toBe("panel");
    expect(continueSurface("same", {})).toBe("panel");
    expect(continueSurface(undefined, { surface: "terminal" })).toBe("terminal");
    expect(continueSurface("panel", { surface: "terminal" })).toBe("panel");
    expect(continueSurface("terminal", {})).toBe("terminal");
  });
});

describe("terminalToClose", () => {
  it("closes only the terminal this extension opened that the record names", () => {
    const t1 = { name: "t1" };
    const opened = new Map([["a1", t1]]);
    expect(terminalToClose(opened, { terminal: "a1" })).toBe(t1);
    // A record from the user's own terminal, or a panel, names none.
    expect(terminalToClose(opened, {})).toBeNull();
    // A terminal this extension did not open (another window, or already gone).
    expect(terminalToClose(opened, { terminal: "zz" })).toBeNull();
  });
});
