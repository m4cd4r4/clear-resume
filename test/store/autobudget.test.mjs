// The per-window auto-continue budget: how many more times this VS Code window
// may open a new conversation by itself. Keyed on the window's extension host.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { autoContinueFor, budgetLabel, DEFAULT_BUDGET, nextBudget, parseBudget, readBudget, setBudget, takeOne } from "../../plugin/packages/store/autobudget.mjs";

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cr-budget-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const win = { pid: "16352", start: 1_780_000_000_000 };

describe("setBudget / readBudget", () => {
  it("reads back the budget set for a window, with none used", () => {
    setBudget(root, win, 3);
    expect(readBudget(root, win)).toMatchObject({ budget: 3, used: 0, left: 3 });
  });

  it("gives a reused pid none of the closed window's budget", () => {
    setBudget(root, win, 3);
    expect(readBudget(root, { pid: win.pid, start: win.start + 60_000 })).toBeNull();
    expect(readBudget(root, { pid: win.pid, start: win.start + 400 })).toMatchObject({ left: 3 });
  });
});

describe("takeOne", () => {
  it("spends one continue while any is left, and refuses once none is", () => {
    setBudget(root, win, 2);
    expect(takeOne(root, win)).toMatchObject({ used: 1, left: 1 });
    expect(takeOne(root, win)).toMatchObject({ used: 2, left: 0 });
    expect(takeOne(root, win)).toBeNull();
    expect(takeOne(root, { pid: "999" })).toBeNull();
    setBudget(root, win, "unlimited");
    expect(takeOne(root, win)).toMatchObject({ used: 1, left: Infinity });
  });
});

describe("budgetLabel / nextBudget", () => {
  it("labels the status bar and cycles off, 3, unlimited", () => {
    expect(budgetLabel(null)).toBe("auto: off");
    expect(budgetLabel({ budget: 0, used: 0, left: 0 })).toBe("auto: off");
    expect(budgetLabel({ budget: 4, used: 2, left: 2 })).toBe("auto: 2 of 4 left");
    expect(budgetLabel({ budget: 3, used: 3, left: 0 })).toBe("auto: 0 of 3 left");
    expect(budgetLabel({ budget: "unlimited", used: 5, left: Infinity })).toBe("auto: unlimited");
    expect([null, { budget: 0 }, { budget: 3 }, { budget: 7 }, { budget: "unlimited" }].map(nextBudget)).toEqual([
      DEFAULT_BUDGET, DEFAULT_BUDGET, "unlimited", "unlimited", 0,
    ]);
  });
});

describe("parseBudget", () => {
  it("takes off, on, unlimited or a count, and refuses anything else", () => {
    expect(parseBudget("off")).toBe(0);
    expect(parseBudget("0")).toBe(0);
    expect(parseBudget("on")).toBe(DEFAULT_BUDGET);
    expect(parseBudget(" 5 ")).toBe(5);
    expect(parseBudget("Unlimited")).toBe("unlimited");
    for (const bad of ["", "-1", "2.5", "lots", "1000"]) expect(() => parseBudget(bad)).toThrow(/off, on, unlimited or a number/);
  });
});

describe("autoContinueFor", () => {
  // The extension continues only an auto handover this window saved, still waiting.
  const rec = (over) => ({ status: "waiting", auto: true, window: `${win.pid}@${win.start}`, machine: "box", createdAt: "2026-10-01T00:00:00.000Z", ...over });
  it("picks this window's oldest waiting auto record, on this machine, and nothing else", () => {
    const mine = rec({ id: "a" });
    const records = [
      rec({ id: "newer", createdAt: "2026-10-01T00:05:00.000Z" }),
      mine,
      rec({ id: "manual", auto: undefined, createdAt: "2026-09-30T00:00:00.000Z" }),
      rec({ id: "taken", status: "archived", createdAt: "2026-09-30T00:00:00.000Z" }),
      rec({ id: "other-window", window: "999@5", createdAt: "2026-09-30T00:00:00.000Z" }),
      rec({ id: "reused-pid", window: `${win.pid}@${win.start + 60_000}`, createdAt: "2026-09-30T00:00:00.000Z" }),
      rec({ id: "other-machine", machine: "laptop", createdAt: "2026-09-30T00:00:00.000Z" }),
    ];
    expect(autoContinueFor(records, win, "box")?.id).toBe("a");
    expect(autoContinueFor(records.filter((r) => r !== mine && r.id !== "newer"), win, "box")).toBeNull();
    // A start a few ms off (rounding between tools) is the same window.
    expect(autoContinueFor([rec({ id: "b", window: `${win.pid}@${win.start + 15}` })], win, "box")?.id).toBe("b");
  });
});
