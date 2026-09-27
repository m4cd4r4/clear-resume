// Windows reuses pids quickly, so a closed window's pid can belong to some other
// process by the time anything asks. An owner is the pid plus the start time of
// its process (`<pid>@<start ms>`), and a pid whose process started at another
// time is a different process. An owner written as a bare pid (before start
// times) falls back to the process name, which must recognise every shape a
// Claude window takes - including a native install named after its version.
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findClaudeAncestor, ownerId, ownerOpen } from "../scripts/lib/owner.mjs";

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

// The native install on macOS and Linux runs a binary named after its version:
// `ps` shows ~/.local/share/claude/versions/2.1.232 (anthropics/claude-code#86706).
describe("ownerOpen on a native install named after its version", () => {
  it("treats a macOS versioned path as an open window (owner written as a bare pid)", () => {
    expect(ownerOpen(LIVE, { table: row("/Users/x/.local/share/claude/versions/2.1.232") })).toBe(true);
  });
});

// An owner is the pid plus its process's start time (<pid>@<start ms>). A pid
// whose process started at another time is a different process: the window that
// wrote the handover has closed, whatever now holds its pid is called.
describe("ownerOpen with the start time", () => {
  const START = 1790503200000;
  it("is open when the start time matches, closed when a later process holds the pid", () => {
    expect(ownerOpen(`${LIVE}@${START}`, { table: [[LIVE, "1", "node", START]] })).toBe(true);
    expect(ownerOpen(`${LIVE}@${START}`, { table: [[LIVE, "1", "node", START + 60_000]] })).toBe(false);
  });
});

describe("ownerId", () => {
  it("is CLAUDE_PID plus that process's start time", () => {
    const readTable = () => [[LIVE, "1", "claude.exe", 1790503200000]];
    expect(ownerId({ CLAUDE_PID: LIVE, CLEAR_RESUME_NO_PROCESS_WALK: "" }, { readTable })).toBe(`${LIVE}@1790503200000`);
  });
});

describe("ownerOpen recognises an open window on each platform", () => {
  const START = 1790503200000;
  const names = {
    "macOS native (ps prints the versioned path)": "/Users/x/.local/share/claude/versions/2.1.232",
    "macOS native as Activity Monitor names it": "2.0.76",
    "Linux native install path": "/home/x/.local/share/claude/versions/2.1.232",
    "Linux native as /proc names it (comm)": "2.1.232",
    "Linux launcher": "claude",
    "npm install run by node": "node",
    "Windows claude.exe (CIM name)": "claude.exe",
    "Windows claude.exe (Get-Process name)": "claude",
  };
  it.each(Object.entries(names))("%s, in both owner formats", (_, name) => {
    expect(ownerOpen(LIVE, { table: [[LIVE, "1", name]] })).toBe(true);
    expect(ownerOpen(`${LIVE}@${START}`, { table: [[LIVE, "1", name, START]] })).toBe(true);
  });
});

describe("ownerOpen on a pid a closed window left behind", () => {
  const START = 1790503200000;
  it.each(["conhost.exe", "git", "/usr/bin/git", "svchost"])("is closed when %s now holds it, in both owner formats", (name) => {
    expect(ownerOpen(LIVE, { table: [[LIVE, "1", name]] })).toBe(false);
    expect(ownerOpen(`${LIVE}@${START}`, { table: [[LIVE, "1", name, START + 60_000]] })).toBe(false);
  });

  it("allows a second of slack in the start time and no more; reads the name when the start is unreadable", () => {
    expect(ownerOpen(`${LIVE}@${START}`, { table: [[LIVE, "1", "git", START + 1000]] })).toBe(true);
    expect(ownerOpen(`${LIVE}@${START}`, { table: [[LIVE, "1", "claude", START - 1001]] })).toBe(false);
    expect(ownerOpen(`${LIVE}@${START}`, { table: [[LIVE, "1", "claude.exe", null]] })).toBe(true);
    expect(ownerOpen(`${LIVE}@${START}`, { table: [[LIVE, "1", "svchost.exe", ""]] })).toBe(false);
  });

  it("is never another window when the pid is this window's own, in either format", () => {
    // Either this window wrote it before owners carried a start time, or a closed
    // window did and this one inherited its pid. Neither is another open window.
    const env = { CLAUDE_PID: LIVE };
    expect(ownerOpen(LIVE, { table: [[LIVE, "1", "claude.exe"]], env })).toBe(false);
    expect(ownerOpen(`${LIVE}@${START}`, { table: [[LIVE, "1", "claude.exe", START + 60_000]], env })).toBe(false);
  });
});

describe("owner lookup fails safe", () => {
  const START = 1790503200000;
  const timedOut = () => {
    throw Object.assign(new Error("spawnSync powershell.exe ETIMEDOUT"), { code: "ETIMEDOUT" });
  };

  it("answers open, and ownerId settles for the bare pid, when the lookup errors or times out", () => {
    expect(ownerOpen(`${LIVE}@${START}`, { readTable: timedOut })).toBe(true);
    expect(ownerOpen(LIVE, { readTable: timedOut })).toBe(true);
    expect(ownerId({ CLAUDE_PID: LIVE }, { readTable: timedOut })).toBe(LIVE);
    expect(ownerId({ CLAUDE_PID: LIVE }, { readTable: () => [] })).toBe(LIVE);
    expect(ownerId({}, { readTable: timedOut })).toBe("");
  });
});

describe("finding this window without CLAUDE_PID", () => {
  it("walks up to a versioned native binary and takes its start time; never stops at node", () => {
    const START = 1790503200000;
    const table = [
      [LIVE, "900", "node"],
      ["900", "800", "/bin/zsh"],
      ["800", "1", "/Users/x/.local/share/claude/versions/2.1.232", START],
    ];
    expect(ownerId({}, { readTable: () => table })).toBe(`800@${START}`);
    expect(findClaudeAncestor("900", [["900", "899", "bash"], ["899", "1", "2.1.232"]])).toBe("899");
    expect(findClaudeAncestor(LIVE, [[LIVE, "900", "node"], ["900", "1", "node"]])).toBe("");
  });
});

// The table-driven tests above fix the rules; this one checks the start time each
// OS really reports, which is what the CI matrix is for.
describe("on this machine's real process table", () => {
  afterEach(() => vi.unstubAllEnvs());
  const timeout = 20_000;

  it("reads a start time that another process reads identically, and tells a later start apart", () => {
    vi.stubEnv("CLEAR_RESUME_NO_PROCESS_WALK", "");
    const me = ownerId({ CLAUDE_PID: LIVE }, { timeout });
    expect(me).toMatch(new RegExp(`^${LIVE}@[0-9]+$`));

    // What save.mjs records in one process, load.mjs and the hook re-read in another.
    const owner = new URL("../scripts/lib/owner.mjs", import.meta.url).href;
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", `import { ownerId } from ${JSON.stringify(owner)}; process.stdout.write(ownerId({ CLAUDE_PID: "${LIVE}" }, { timeout: ${timeout} }))`],
      { encoding: "utf8", env: { ...process.env, CLEAR_RESUME_NO_PROCESS_WALK: "" } },
    );
    expect(child.stdout).toBe(me);

    const elsewhere = { CLAUDE_PID: "" };
    expect(ownerOpen(me, { env: elsewhere, timeout })).toBe(true);
    expect(ownerOpen(`${LIVE}@${Number(me.split("@")[1]) - 60_000}`, { env: elsewhere, timeout })).toBe(false);
  }, 60_000);
});
