// Windows reuses pids quickly, so a closed window's pid can belong to some other
// process by the time load.mjs asks. `ownerOpen` checks the pid is still a
// Claude-shaped process before calling the window open.
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ownerOpen } from "../scripts/lib/owner.mjs";

const LIVE = String(process.pid);
const row = (name) => [[LIVE, "1", name]];

describe("ownerOpen", () => {
  it("is false when the pid's process has become something that is not Claude", () => {
    expect(ownerOpen(LIVE, { table: row("conhost.exe") })).toBe(false);
  });

  it("answers open for a Claude or node process, and whenever it cannot tell; closed for a dead pid", () => {
    expect(ownerOpen(LIVE, { table: row("claude.exe") })).toBe(true);
    expect(ownerOpen(LIVE, { table: row("node") })).toBe(true);
    expect(ownerOpen(LIVE, { table: [] })).toBe(true);
    const dead = String(spawnSync(process.execPath, ["-e", ""]).pid);
    expect(ownerOpen(dead, { table: [[dead, "1", "claude.exe"]] })).toBe(false);
  });
});
