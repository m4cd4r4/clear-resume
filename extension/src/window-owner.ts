import { execFile } from "node:child_process";
import { basename } from "node:path";
import type { StoredHandover } from "../../plugin/packages/store/store.mjs";

// Which window's session loaded a handover. A record's archivedBy.owner is the
// Claude process that loaded it, and in the VS Code panel that process is a child
// of its window's extension host: the process this extension runs in. So a load is
// this window's when the owner's parent is process.pid, and another window's when
// the parent is a different extension host. A session in a terminal, or an owner
// that has exited, cannot be placed and stays unknown (2026-10-04).

type Parent = { pid: number; exe: string } | null;

const host = basename(process.execPath).toLowerCase();
const parents = new Map<string, Parent>();
const pending = new Set<string>();

function lookup(pid: string): Promise<Parent> {
  return new Promise((resolve) => {
    const done = (out: string) => {
      const [ppid, exe = ""] = out.trim().split("|");
      const n = Number(ppid);
      resolve(Number.isInteger(n) && n > 0 ? { pid: n, exe: basename(exe.trim()).toLowerCase() } : null);
    };
    if (process.platform === "win32") {
      const script =
        `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; ` +
        `if ($p) { $q = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)"; "$($p.ParentProcessId)|$($q.ExecutablePath)" }`;
      execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 10_000, windowsHide: true }, (err, out) =>
        err ? resolve(null) : done(out),
      );
      return;
    }
    execFile("ps", ["-o", "ppid=", "-p", pid], { timeout: 5_000 }, (err, out) => {
      const ppid = out?.trim();
      if (err || !ppid) return resolve(null);
      execFile("ps", ["-o", "comm=", "-p", ppid], { timeout: 5_000 }, (_e, comm) => done(`${ppid}|${comm ?? ""}`));
    });
  });
}

/**
 * Whether a Claude process is this window's: true when its parent is this
 * extension host, false when it is another window's extension host, null when
 * not known. A pid not yet looked up reads as null, and the lookup runs in the
 * background and calls `onLearn` when it ends, once per `key` (the pid, or the
 * pid plus its start time where that is known, so a reused pid is looked up
 * again): a process's parent does not change while it lives.
 */
export function ownedProcess(onLearn: () => void): (pid: string, key?: string) => boolean | null {
  return (pid, key = pid) => {
    if (!/^\d+$/.test(pid)) return null;
    if (!parents.has(key)) {
      if (!pending.has(key)) {
        pending.add(key);
        void lookup(pid).then((parent) => {
          parents.set(key, parent);
          pending.delete(key);
          onLearn();
        });
      }
      return null;
    }
    const parent = parents.get(key);
    if (!parent) return null;
    if (parent.pid === process.pid) return true;
    return parent.exe === host ? false : null;
  };
}

/** The `owned` classifier for loadedInFolders: a record is this window's when the process that loaded it is. */
export function ownedByThisWindow(onLearn: () => void): (record: StoredHandover) => boolean | null {
  const owned = ownedProcess(onLearn);
  return (record) => owned(String(record.archivedBy?.owner ?? "").split("@")[0]);
}
