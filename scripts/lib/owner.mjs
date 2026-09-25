// Which Claude Code window a handover belongs to.
//
// Every window on a repo can share one branch (all the sessions opened in the
// same folder do), so the branch cannot tell windows apart. That cost two real
// handovers on 2026-09-25: one window's /clear loaded another window's handover
// two minutes after it was written, and a later save archived a third window's
// handover because it sat on the same branch.
//
// The Claude process id survives /clear in the same panel, so it is the owner.
// Claude Code exports it to tool shells as CLAUDE_PID; a hook may not get that
// variable, so the fallback walks up the process tree to the claude executable.
import { execFileSync } from "node:child_process";

const CLAUDE_EXE = /^claude(\.exe)?$/i;

function processTable() {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command",
          "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name)\" }"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true, timeout: 5000 },
      );
      return out.split(/\r?\n/).map((l) => l.split("\t")).filter((r) => r.length === 3);
    }
    const out = execFileSync("ps", ["-A", "-o", "pid=,ppid=,comm="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
    return out.split("\n").map((l) => l.trim().split(/\s+/)).filter((r) => r.length >= 3)
      .map(([pid, ppid, ...comm]) => [pid, ppid, comm.join(" ").split("/").pop()]);
  } catch {
    return [];
  }
}

/** The pid of the nearest `claude` ancestor, or "" when there is none. */
export function findClaudeAncestor(startPid = process.pid, table = processTable()) {
  const byPid = new Map(table.map(([pid, ppid, name]) => [String(pid), { ppid: String(ppid), name }]));
  let pid = String(startPid);
  for (let i = 0; i < 32 && byPid.has(pid); i++) {
    const { ppid, name } = byPid.get(pid);
    if (CLAUDE_EXE.test(name)) return pid;
    if (ppid === pid) break;
    pid = ppid;
  }
  return "";
}

/** This window's owner id, or "" when it cannot be told. Never throws. */
export function ownerId(env = process.env) {
  const fromEnv = String(env.CLAUDE_PID ?? "").trim();
  if (fromEnv) return fromEnv;
  if (env.CLEAR_RESUME_NO_PROCESS_WALK || process.env.CLEAR_RESUME_NO_PROCESS_WALK) return "";
  return findClaudeAncestor();
}

/** Whether the window that owns a handover is still running. */
export function ownerAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
