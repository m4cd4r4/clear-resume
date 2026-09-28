// Claude Code kills a SessionStart hook after 10s, and the pull may already have
// spent 8s of that. The owner lookup comes after the pull, so a fixed 2.5s wait
// for the process table ran the hook past 10s (8.3s on main, 10.9s on the branch
// with a slow table, review of fix/owner-and-hook-cost, 2026-09-27), and that
// /clear loaded nothing. The lookup has to fit in what is left of the budget.
//
// These run the real session-start.mjs in its own process, so the budget counts
// from that process's start exactly as in a real window. A preload makes every
// process-table read (powershell.exe, ps) take its whole timeout and then fail;
// Linux reads /proc, which cannot be slow in this way, so there the reads are
// simply not counted.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveHandover } from "../plugin/scripts/lib/store.mjs";

const SESSION_START = join(import.meta.dirname, "../plugin/scripts/session-start.mjs");

const SLOW_TABLE = `
const cp = require("child_process");
const fs = require("fs");
const real = cp.execFileSync;
cp.execFileSync = function (cmd, args, opts) {
  const name = String(cmd).split(/[\\\\/]/).pop().toLowerCase();
  if (name === "powershell.exe" || name === "ps") {
    const t = Number(opts && opts.timeout) || 0;
    fs.appendFileSync(process.env.CR_TEST_TABLE_LOG, t + "\\n");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, t);
    throw Object.assign(new Error("spawnSync " + cmd + " ETIMEDOUT"), { code: "ETIMEDOUT" });
  }
  return real.apply(this, arguments);
};
require("module").syncBuiltinESMExports();
`;

let dir, home, repo, preload, tableLog, windows;
const git = (cwd, ...a) => execFileSync("git", a, { cwd, stdio: "ignore" });
const openWindow = () => spawn(process.execPath, ["-e", "setInterval(() => {}, 1e6)"], { stdio: "ignore" });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cr-deadline-"));
  home = mkdtempSync(join(dir, "home-"));
  repo = mkdtempSync(join(dir, "repo-"));
  preload = join(dir, "slow-table.cjs");
  tableLog = join(dir, "table-reads.log");
  writeFileSync(preload, SLOW_TABLE, "utf8");
  git(repo, "init", "-q", "-b", "main");
  git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
  windows = [openWindow(), openWindow()];
});

afterEach(() => {
  for (const w of windows) w.kill();
  rmSync(dir, { recursive: true, force: true });
});

function sessionStart(extraEnv) {
  const env = { ...process.env, CLEAR_RESUME_HOME: home, CLEAR_RESUME_NO_PROCESS_WALK: "", CR_TEST_TABLE_LOG: tableLog, ...extraEnv };
  delete env.CLEAR_RESUME_PROCESS_TIMEOUT_MS;
  const began = Date.now();
  const out = spawnSync(process.execPath, ["--require", preload, SESSION_START], {
    input: JSON.stringify({ cwd: repo, source: "startup" }),
    encoding: "utf8",
    env,
    timeout: 30_000,
  });
  return { ms: Date.now() - began, stdout: out.stdout };
}

describe("SessionStart owner lookup against the hook's 10s budget", () => {
  it("still finishes inside 10s when the pull takes its full 8s and the process table is slow", () => {
    const [mine, theirs] = windows.map((w) => String(w.pid));
    saveHandover({ cwd: repo, title: "Their work", body: "t", root: home, owner: theirs });
    saveHandover({ cwd: repo, title: "My work", body: "m", root: home, owner: mine });
    // A synced store whose fetch hangs until the pull's own timeout.
    git(home, "init", "-q", "-b", "main");
    git(home, "remote", "add", "origin", "ssh://git@example.invalid/x.git");
    // Run from outside the store: Windows cannot delete a folder a live process sits in.
    const slash = (p) => p.replace(/\\/g, "/");
    const hang = `cd "${slash(tmpdir())}" && exec "${slash(process.execPath)}" -e "setTimeout(() => {}, 20000)"`;

    const { ms, stdout } = sessionStart({ CLAUDE_PID: mine, GIT_SSH_COMMAND: hang, GIT_TERMINAL_PROMPT: "0" });

    expect(ms).toBeLessThan(10_000);
    expect(JSON.parse(stdout).systemMessage).toMatch(/loaded handover "My work"/);
  }, 40_000);

  // Without CLAUDE_PID the hook walks the tree (CIM on Windows). When that read
  // timed out, the check on the next owner fell through to a fresh Get-Process
  // read and paid a second full timeout: 5.2s with no pull at all (review, run2).
  it("reads the process table at most once when the first read fails", () => {
    const [a, b] = windows.map((w) => String(w.pid));
    saveHandover({ cwd: repo, title: "A", body: "a", root: home, owner: a });
    saveHandover({ cwd: repo, title: "B", body: "b", root: home, owner: b });

    sessionStart({ CLAUDE_PID: "" });

    const reads = existsSync(tableLog) ? readFileSync(tableLog, "utf8").split("\n").filter(Boolean) : [];
    expect(reads.length).toBeLessThanOrEqual(1);
  }, 40_000);
});
