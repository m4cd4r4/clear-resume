// The Spare Cycles status bar reads the mod's ~/.spare-cycles/state.json. A file it
// cannot use hides the item rather than showing an error, so every bad shape here
// must come back as null.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { actionJson, countdown, readState, spareDir, statusText } from "../extension/src/spare-state.ts";

const STATE = {
  version: 1,
  task: "Wash the dishes",
  dueAt: 1759712345000,
  isDue: false,
  lastAction: "done: 10 push-ups",
  owner: "1234",
  updatedAt: 1759712300000,
};

describe("readState", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cr-spare-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const write = (text) => writeFileSync(join(dir, "state.json"), text);

  it("reads a valid file", () => {
    write(JSON.stringify(STATE));
    expect(readState(dir)).toEqual({
      version: 1,
      task: "Wash the dishes",
      dueAt: 1759712345000,
      isDue: false,
      lastAction: "done: 10 push-ups",
      updatedAt: 1759712300000,
    });
  });

  it("takes a null lastAction, as the mod writes before the first action", () => {
    write(JSON.stringify({ ...STATE, lastAction: null }));
    expect(readState(dir)?.lastAction).toBeNull();
  });

  it("returns null for a missing file", () => {
    expect(readState(dir)).toBeNull();
    expect(readState(join(dir, "no-such-folder"))).toBeNull();
  });

  it("returns null for bad JSON", () => {
    write("{ \"version\": 1, \"task\": ");
    expect(readState(dir)).toBeNull();
    write("");
    expect(readState(dir)).toBeNull();
    write("null");
    expect(readState(dir)).toBeNull();
  });

  it("returns null for a version other than 1", () => {
    write(JSON.stringify({ ...STATE, version: 2 }));
    expect(readState(dir)).toBeNull();
    write(JSON.stringify({ ...STATE, version: "1" }));
    expect(readState(dir)).toBeNull();
    const { version, ...noVersion } = STATE;
    write(JSON.stringify(noVersion));
    expect(readState(dir)).toBeNull();
  });

  it("returns null without a task or a due time", () => {
    write(JSON.stringify({ ...STATE, task: "" }));
    expect(readState(dir)).toBeNull();
    write(JSON.stringify({ ...STATE, dueAt: "soon" }));
    expect(readState(dir)).toBeNull();
  });

  it("lives in ~/.spare-cycles", () => {
    expect(spareDir("/home/me")).toBe(join("/home/me", ".spare-cycles"));
  });
});

describe("countdown", () => {
  it("shows minutes and seconds over a minute", () => {
    expect(countdown(102_000)).toBe("1:42");
    expect(countdown(45 * 60_000)).toBe("45:00");
  });

  it("shows 0:ss under a minute, rounding up", () => {
    expect(countdown(42_000)).toBe("0:42");
    expect(countdown(9_001)).toBe("0:10");
    expect(countdown(1)).toBe("0:01");
  });

  it("shows 0:00 at or past due", () => {
    expect(countdown(0)).toBe("0:00");
    expect(countdown(-5_000)).toBe("0:00");
  });
});

describe("statusText", () => {
  const state = STATE;

  it("counts down to the task", () => {
    expect(statusText(state, state.dueAt - 102_000)).toBe("$(watch) 1:42 Wash the dishes");
  });

  it("says now once the clock reaches dueAt", () => {
    expect(statusText(state, state.dueAt)).toBe("$(bell) Wash the dishes: now");
    expect(statusText(state, state.dueAt + 60_000)).toBe("$(bell) Wash the dishes: now");
  });

  it("says now when the mod marks the task due, whatever the clock", () => {
    expect(statusText({ ...state, isDue: true }, state.dueAt - 5_000)).toBe("$(bell) Wash the dishes: now");
  });
});

describe("actionJson", () => {
  it("writes the action and when it was chosen", () => {
    expect(JSON.parse(actionJson("snooze", 1759712400000))).toEqual({ action: "snooze", at: 1759712400000 });
  });
});
