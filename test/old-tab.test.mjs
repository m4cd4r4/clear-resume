// After an auto-continue, the extension closes the old Claude Code tab, but only
// when it can tell which one that is: every Claude tab is labelled "Claude Code"
// and carries no session id (probe, 2026-10-01, Claude Code 2.1.285).
import { describe, expect, it } from "vitest";
import { oldTabToClose } from "../extension/src/oldtab.ts";

describe("oldTabToClose", () => {
  it("closes the one Claude tab there was, once exactly one new tab has opened beside it", () => {
    const old = { id: "old" };
    const fresh = { id: "new" };
    expect(oldTabToClose([old], [old, fresh])).toBe(old);
    // Two sessions before: which one handed over is unknown, so close nothing.
    const other = { id: "other" };
    expect(oldTabToClose([old, other], [old, other, fresh])).toBeNull();
    // The new conversation did not open a tab (it reused one, or failed): close nothing.
    expect(oldTabToClose([old], [old])).toBeNull();
    // The old tab is already gone.
    expect(oldTabToClose([old], [fresh])).toBeNull();
  });
});
