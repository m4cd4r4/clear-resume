import { describe, expect, it } from "vitest";
import { chainTotals, effective, feedUsage, newUsage, pickWindow, picks, pie, projectDirName, relayText, hoverText } from "../../plugin/packages/store/relay-state.mjs";

const state = (over) => ({
  v: 1,
  key: "k1",
  cwd: "I:/code/acme",
  sessions: ["s1"],
  limit: 3,
  configured: 3,
  used: 0,
  stalled: 0,
  applied: 0,
  updatedAt: 1000,
  ...over,
});

describe("pickWindow", () => {
  it("takes the newest state under a workspace folder, not a sibling with a shared prefix", () => {
    const files = [
      state({ key: "old", updatedAt: 1000 }),
      state({ key: "new", cwd: "i:\\code\\acme\\sub", updatedAt: 3000 }),
      state({ key: "sibling", cwd: "I:/code/acme-two", updatedAt: 9000 }),
    ];
    expect(pickWindow(files, ["I:/code/acme"])?.key).toBe("new");
  });
});

describe("effective", () => {
  it("shows a status-bar choice the mod has not taken yet, with the count at 0", () => {
    const f = state({ limit: 3, used: 2, applied: 100 });
    expect(effective(f, { limit: "unlimited", at: 200 })).toEqual({ limit: Infinity, used: 0, pending: true });
    expect(effective(f, { limit: "off", at: 100 })).toEqual({ limit: 3, used: 2, pending: false });
    expect(effective(f, null)).toEqual({ limit: 3, used: 2, pending: false });
  });
});

describe("projectDirName", () => {
  it("turns every character but letters and digits into a dash, as Claude Code names its project folders", () => {
    expect(projectDirName("i:\\Scratch\\clear-resume")).toBe("i--Scratch-clear-resume");
    expect(projectDirName("I:/Scratch/my_app.v2")).toBe("I--Scratch-my-app-v2");
  });
});

const row = (id, ctx, over = {}) =>
  JSON.stringify({
    type: "assistant",
    message: { id, model: "claude-opus-5-5", usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: ctx - 10 } },
    ...over,
  }) + "\n";

describe("feedUsage", () => {
  it("counts each main-thread call once, across chunks that cut a line in half", () => {
    const text =
      row("m1", 1000) +
      row("m1", 1000) + // the same message on a second line: one call
      row("m2", 5000, { isSidechain: true }) +
      row("m3", 7000, { message: { id: "m3", model: "<synthetic>", usage: { input_tokens: 7000 } } }) +
      JSON.stringify({ type: "user", message: { content: "hi" } }) + "\n" +
      row("m4", 3000);
    const cut = text.length - 20;
    const u = newUsage();
    feedUsage(u, text.slice(0, cut));
    feedUsage(u, text.slice(cut));
    expect(u).toMatchObject({ calls: 2, sum: 4000, first: 1000, last: 3000, partial: "" });
  });
});

describe("chainTotals", () => {
  it("sums the chain, and bounds the saving by each clear's drop carried into every later call", () => {
    const s = (calls, sum, first, last) => ({ calls, sum, first, last });
    const totals = chainTotals([
      s(3, 300_000, 20_000, 150_000),
      s(4, 340_000, 30_000, 140_000), // the first clear dropped 150k to 30k: 120k off each of 4 calls
      s(2, 80_000, 25_000, 60_000), // and both drops so far, 120k + 115k, off each of 2 calls
      s(0, 0, null, null), // a session with no calls yet adds nothing
    ]);
    expect(totals).toEqual({ sessions: 4, replies: 9, tokens: 720_000, saved: 4 * 120_000 + 2 * 235_000 });
  });
});

describe("pie", () => {
  it("fills by the share of the nudge threshold, amber from 80% and red at the threshold", () => {
    expect(pie(10_000, 180_000)).toEqual({ text: "○ 10k/180k", level: "ok", bar: "▱▱▱▱▱" });
    expect(pie(90_000, 180_000)).toEqual({ text: "◑ 90k/180k", level: "ok", bar: "▰▰▰▱▱" });
    expect(pie(144_000, 180_000)).toEqual({ text: "◕ 144k/180k", level: "warn", bar: "▰▰▰▰▱" });
    expect(pie(250_000, 180_000)).toEqual({ text: "● 250k/180k", level: "over", bar: "▰▰▰▰▰" });
  });
});

describe("relay item and picker", () => {
  it("shows used of limit, and maps each pick to what <key>.set.json takes, ticking the current one", () => {
    expect(relayText({ limit: 15, used: 3 })).toBe("⟳ relay 3/15");
    expect(relayText({ limit: Infinity, used: 4 })).toBe("⟳ relay 4/∞");
    expect(relayText({ limit: 0, used: 0 })).toBe("⟳ relay off");
    expect(picks(5).map((p) => [p.label, p.limit, p.current])).toEqual([
      ["Off", "off", false],
      ["2", "2", false],
      ["3", "3", false],
      ["5", "5", true],
      ["10", "10", false],
      ["15", "15", false],
      ["Unlimited", "unlimited", false],
    ]);
    expect(picks(Infinity).find((p) => p.current)?.label).toBe("Unlimited");
    expect(picks(0).find((p) => p.current)?.label).toBe("Off");
  });
});

describe("hoverText", () => {
  it("shows the meter, the clears left, the chain and the saving as an upper bound, then the links", () => {
    const md = hoverText({
      context: 144_000,
      threshold: 180_000,
      relay: { limit: 15, used: 3, pending: false },
      totals: { sessions: 4, replies: 31, tokens: 1_234_000, saved: 950_000 },
      links: { handover: "command:clearResume.openLoaded", log: "command:clearResume.relayLog" },
    });
    expect(md.split("\n\n")).toEqual([
      "`▰▰▰▰▱` 144k of 180k nudge",
      "Relay: 3 clears used, 12 left in this window",
      "This chain: 1234k tokens read over 31 replies in 4 sessions, saved up to ~950k (an upper bound)",
      "[Open handover](command:clearResume.openLoaded) · [Relay log](command:clearResume.relayLog)",
    ]);
  });

  it("says when the relay is off, unlimited or waiting for the next turn, and drops a link it was not given", () => {
    const base = { context: 0, threshold: 180_000, totals: { sessions: 1, replies: 0, tokens: 0, saved: 0 }, links: {} };
    expect(hoverText({ ...base, relay: { limit: 0, used: 0, pending: false } })).toContain("Relay: off in this window");
    expect(hoverText({ ...base, relay: { limit: Infinity, used: 2, pending: false } })).toContain("Relay: 2 clears used, no cap");
    expect(hoverText({ ...base, relay: { limit: 5, used: 0, pending: true } })).toContain("(takes effect after the next reply)");
    expect(hoverText({ ...base, relay: null })).not.toContain("Relay");
    expect(hoverText({ ...base, relay: null })).not.toContain("](");
  });
});
