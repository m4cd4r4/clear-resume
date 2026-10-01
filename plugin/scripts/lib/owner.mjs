// Which Claude Code window a handover belongs to.
//
// Every window on a repo can share one branch (all the sessions opened in the
// same folder do), so the branch cannot tell windows apart. That cost two real
// handovers on 2026-09-25: one window's /clear loaded another window's handover
// two minutes after it was written, and a later save archived a third window's
// handover because it sat on the same branch.
//
// The Claude process survives /clear in the same panel, so it is the owner.
// Claude Code exports its pid to tool shells and hooks as CLAUDE_PID (measured
// with Claude Code 2.1.278); when a hook does not get that variable, the
// fallback walks up the process tree to the claude executable.
//
// An owner is written `<pid>@<start>`: the pid plus the start time of the
// process holding it, in milliseconds (since 1970; on Linux, since boot). The
// pid alone is not enough.
// Windows hands a closed window's pid to the next process within minutes, and
// on macOS and Linux the native binary is named after its version
// (~/.local/share/claude/versions/2.1.232), so the process name cannot say
// "Claude" either. A pid whose process started at another time is a different
// process, whatever it is called.
//
// An owner written before the start time was recorded is a bare pid. It is
// judged the old way: a live pid must still name a Claude-shaped process.
//
// Every doubt answers "open". The cost of that mistake is a handover listed
// rather than loaded (or a load.mjs --take); the cost of the other is taking a
// live window's handover.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";

// A hook waits at most this long for the process table when it asks about
// another window, and then carries on not knowing: that only answers "open"...
const HOOK_TIMEOUT_MS = 2500;
// ...and never past this point in its own run. Claude Code kills a SessionStart
// hook at 10s, the pull before the lookup may take 8s of that, and the archive
// and git reads after it need the rest. So a hook's read gets what is left of 9s
// since the hook started, up to 2.5s. With under 200ms left it does not read at
// all and answers as a failed lookup does: the bare CLAUDE_PID for this window,
// "open" for any other. A fixed 2.5s ran a slow-pull start to 10.7s (review of
// fix/owner-and-hook-cost, 2026-09-27), and Claude Code killed it.
//
// This window's own lookup (ownerId) is not held to the 2.5s: it gets all that is
// left of the 9s. Not knowing this window's start costs its own handover, listed
// instead of loaded and after /compact not offered at all, and under load
// Get-Process took over 2.5s (2026-09-28: the --take tests failed that way when
// several suites ran at once). The hook asks only when a handover in play carries
// this window's pid, so only a /clear that should load one pays for the wait.
const HOOK_BUDGET_MS = 9000;
const MIN_LOOKUP_MS = 200;
// A hook is its own process, so the process's start is the hook's, node's own
// startup included.
let hookStart = performance.timeOrigin;

/**
 * Restart the hook's budget, for a caller that runs hook code inside a
 * longer-lived process (the tests). Each such run is a new hook, so the reads an
 * earlier one remembered, a failed one included, are forgotten too.
 */
export function startHookClock(at = Date.now()) {
  hookStart = at;
  memo.clear();
}
// load.mjs and save.mjs have no budget. Windows PowerShell on a cold CI runner
// took over 5s.
export const PATIENT_TIMEOUT_MS = 15_000;
// Start times read by different tools can round differently. A window that lived
// for less than a second never wrote a handover, so a second of slack cannot
// mistake a reused pid for its old owner.
const START_SLACK_MS = 1000;
// One hook or CLI run asks about a few pids within milliseconds; one read serves
// them all.
const MEMO_MS = 5000;

const walkOff = (env) => Boolean(env.CLEAR_RESUME_NO_PROCESS_WALK || process.env.CLEAR_RESUME_NO_PROCESS_WALK);
const timeoutFor = (env, fallback) =>
  Number(env.CLEAR_RESUME_PROCESS_TIMEOUT_MS || process.env.CLEAR_RESUME_PROCESS_TIMEOUT_MS) || fallback;

// How long a read may take now: a function, so a later read in the same run gets
// what is left by then. An explicit timeout (load.mjs, save.mjs) has no deadline.
// A hook's own lookup (`self`) is capped only by the budget, or by an explicit
// CLEAR_RESUME_PROCESS_TIMEOUT_MS.
function budget(env, timeout, { self = false } = {}) {
  if (timeout != null) {
    const t = timeoutFor(env, timeout);
    return () => t;
  }
  const cap = timeoutFor(env, self ? Infinity : HOOK_TIMEOUT_MS);
  return () => Math.min(cap, HOOK_BUDGET_MS - (Date.now() - hookStart));
}

// ---- reading the process table -------------------------------------------
// A row is [pid, ppid, name, start]: start in ms (since boot on Linux), or null when unreadable.

function exec(cmd, args, timeout, env) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true, timeout, env });
}

const FILETIME_UNIX_EPOCH = 116444736000000000n;
const fileTimeMs = (ft) => (/^\d+$/.test(String(ft).trim()) ? Number((BigInt(String(ft).trim()) - FILETIME_UNIX_EPOCH) / 10000n) : null);

function powershell(script, timeout) {
  return exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], timeout)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split("\t"));
}

// Get-Process skips WMI, which is the slow part (about 1s here, over 5s on a
// cold CI runner), but in Windows PowerShell 5.1 it has no parent pid. So the
// tree walk, needed only without CLAUDE_PID, still goes through CIM.
const WIN_PROCESSES =
  "Get-Process | ForEach-Object { $s = try { $_.StartTime.ToFileTimeUtc() } catch { '' }; \"$($_.Id)`t$($_.ProcessName)`t$s\" }";
const WIN_TREE =
  "Get-CimInstance Win32_Process | ForEach-Object { $s = if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { '' }; \"$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name)`t$s\" }";

const windowsProcesses = (timeout) => powershell(WIN_PROCESSES, timeout).map(([pid, name, s]) => [pid, "", name, fileTimeMs(s)]);
const windowsTree = (timeout) => powershell(WIN_TREE, timeout).map(([pid, ppid, name, s]) => [pid, ppid, name, fileTimeMs(s)]);

// macOS and the BSDs. lstart is fixed by the kernel at exec; printed in UTC and
// the C locale it parses the same way every time.
function psTable(timeout) {
  return exec("ps", ["-A", "-o", "pid=,ppid=,lstart=,comm="], timeout, { ...process.env, LC_ALL: "C", TZ: "UTC" })
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter((t) => t.length >= 8)
    .map((t) => [t[0], t[1], t.slice(7).join(" "), Date.parse(`${t.slice(2, 7).join(" ")} UTC`) || null]);
}

// Linux: read /proc directly. No process to spawn, so nothing to time out, and it
// works in a container with no procps.
//
// The start is kept as milliseconds since boot, not converted to a date: the
// boot time in /proc/stat moves whenever the wall clock is stepped (NTP, a WSL
// resume), and a start that drifted would make an open window look closed.
function linuxRow(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = stat.lastIndexOf(")");
    const name = stat.slice(stat.indexOf("(") + 1, close);
    const f = stat.slice(close + 2).split(" ");
    // Field 22, starttime, counts clock ticks since boot; USER_HZ is 100.
    return [String(pid), f[1], name, Number(f[19]) * 10];
  } catch {
    return null;
  }
}

const memo = new Map();
function remembered(kind, read, left) {
  const hit = memo.get(kind);
  if (hit && Date.now() - hit.at < MEMO_MS) return { rows: hit.rows, fresh: false };
  const timeout = left();
  // Out of time: not read, and not remembered either, since nothing failed.
  if (timeout < MIN_LOOKUP_MS) return { rows: null, fresh: true };
  let rows = null;
  try {
    rows = read(timeout);
  } catch {
    rows = null; // timed out or failed: remembered too, so it is paid for once
  }
  memo.set(kind, { at: Date.now(), rows });
  return { rows, fresh: true };
}

// A pid missing from a remembered table may belong to a process started since;
// read the table again, once, before calling it unknown.
function tableLookup(kind, read, left) {
  const first = remembered(kind, read, left);
  const find = byPid(first.rows);
  if (!find) return null;
  return (pid) => {
    const row = find(pid);
    if (row || first.fresh) return row;
    memo.delete(kind);
    return byPid(remembered(kind, read, left).rows)?.(pid) ?? null;
  };
}

function byPid(rows) {
  if (!Array.isArray(rows)) return null;
  const map = new Map(rows.map((r) => [String(r[0]), r]));
  return (pid) => map.get(String(pid)) ?? null;
}

// A pid -> row lookup, or null when the table could not be read at all.
function lookupFrom({ table, readTable, tree = false, left }) {
  if (table) return byPid(table);
  if (readTable) {
    const timeout = left();
    if (timeout < MIN_LOOKUP_MS) return null;
    try {
      return byPid(readTable(timeout));
    } catch {
      return null;
    }
  }
  if (process.platform === "linux") return linuxRow;
  // A read that failed moments ago is not tried again in another form: after a
  // timed-out tree walk, a Get-Process read paid a second full timeout (5.2s with
  // no pull at all, review of fix/owner-and-hook-cost, 2026-09-27).
  if ([...memo.values()].some((m) => m.rows == null && Date.now() - m.at < MEMO_MS)) return null;
  if (process.platform !== "win32") return tableLookup("ps", psTable, left);
  const walked = memo.get("tree");
  if (tree || (walked?.rows && Date.now() - walked.at < MEMO_MS)) return tableLookup("tree", windowsTree, left);
  return tableLookup("processes", windowsProcesses, left);
}

const startOf = (row) => {
  const n = Number(row?.[3]);
  return row?.[3] != null && row[3] !== "" && Number.isFinite(n) && n > 0 ? n : null;
};

// ---- what counts as Claude -------------------------------------------------

const base = (name) => String(name ?? "").split(/[\\/]/).pop();
const VERSIONED = /^\d+\.\d+\.\d+([-+.][0-9A-Za-z.-]+)?$/;

/** The Claude executable itself: claude, claude.exe, or a native build named after its version. */
export function isClaudeWindow(name) {
  const b = base(name).replace(/\.exe$/i, "");
  return /^claude$/i.test(b) || VERSIONED.test(b) || /[\\/]claude[\\/]versions[\\/][^\\/]+$/i.test(String(name ?? ""));
}

// Node as well, for an npm install. Anything else holding the pid is a reuse of
// a closed window's pid. Not for the walk: the hook is itself node.
const isClaudeHost = (name) => isClaudeWindow(name) || /^node(\.exe)?$/i.test(base(name));

// ---- owners ------------------------------------------------------------------

/** Split an owner into its pid and start time; a bare pid (the old format) has no start. */
export function parseOwner(owner) {
  const m = /^(\d+)(?:@(\d+))?$/.exec(String(owner ?? "").trim());
  return m ? { pid: m[1], start: m[2] ? Number(m[2]) : null } : { pid: "", start: null };
}

/**
 * Whether two owners could name the same window: the same pid and, when both
 * carry a start time, starts within a second. A bare pid matches its pid at any
 * start. Used where erring towards "same" only withholds the "another open
 * window" label; deciding a handover is this window's own is `isOwnHandover`.
 */
export function sameOwner(a, b) {
  const x = parseOwner(a);
  const y = parseOwner(b);
  if (!x.pid || x.pid !== y.pid) return false;
  return x.start == null || y.start == null || Math.abs(x.start - y.start) <= START_SLACK_MS;
}

function uptimeMs() {
  try {
    return Number(readFileSync("/proc/uptime", "utf8").split(" ")[0]) * 1000;
  } catch {
    return null;
  }
}

/** A recorded start time as ms since 1970. Linux records ms since boot, so the boot time (as of now) is added. */
export function startEpochMs(start, platform = process.platform) {
  if (start == null) return null;
  if (platform !== "linux") return start;
  const up = uptimeMs();
  return up == null ? null : Date.now() - up + start;
}

/** The inverse of `startEpochMs`: a date as a start time in this platform's form. */
export function startFromEpochMs(ms, platform = process.platform) {
  if (platform !== "linux") return ms;
  const up = uptimeMs();
  return up == null ? null : Math.round(ms - (Date.now() - up));
}

/**
 * Whether a waiting handover (`owner`, saved at `created` on `machine`) is provably
 * this window's own, `me` being this window's owner id. Every condition must hold:
 *
 * - This window's start time is known. Without it a bare pid matches a closed
 *   window's handover as well as its own (reviews 4 and 5, 2026-09-27).
 * - The same pid.
 * - Saved no earlier than this window started: a window cannot save before it
 *   exists. That rules out a closed window whose pid this one was given, and on
 *   Linux a handover from an earlier boot, whose since-boot start can repeat.
 * - When the handover has a start time too, the starts are within a second. A bare
 *   one saved since this window started is its own, from before the upgrade or
 *   from a save whose lookup failed.
 * - Written on this machine, when the record says. A synced store holds other
 *   machines' handovers, and pids repeat across machines.
 *
 * Anything unproven is not this window's; it is then judged like any other
 * window's handover, and a handover of this window's own on the current branch
 * still loads by the branch rule.
 */
export function isOwnHandover(me, owner, created, { toEpoch = startEpochMs, machine } = {}) {
  const m = parseOwner(me);
  const o = parseOwner(owner);
  if (!m.pid || m.start == null || m.pid !== o.pid) return false;
  if (machine && machine !== hostname()) return false;
  const began = toEpoch(m.start);
  const at = Date.parse(created ?? "");
  if (began == null || !Number.isFinite(at) || at < began - START_SLACK_MS) return false;
  return o.start == null || Math.abs(m.start - o.start) <= START_SLACK_MS;
}

const withStart = (pid, row) => (startOf(row) ? `${pid}@${startOf(row)}` : String(pid));

function ancestorRow(startPid, lookup) {
  let pid = String(startPid);
  for (let i = 0; i < 32; i++) {
    const row = lookup(pid);
    if (!row) break;
    if (isClaudeWindow(row[2])) return row;
    const ppid = String(row[1] ?? "");
    if (!ppid || ppid === pid) break;
    pid = ppid;
  }
  return null;
}

/** The pid of the nearest `claude` ancestor, or "" when there is none. */
export function findClaudeAncestor(startPid = process.pid, table) {
  const lookup = typeof table === "function" ? table : table ? byPid(table) : lookupFrom({ tree: true, left: budget(process.env) });
  return lookup ? String(ancestorRow(startPid, lookup)?.[0] ?? "") : "";
}

// The pid this window was found at by a walk, for `ownerOpen` without CLAUDE_PID.
let walkedPid = "";
const myPid = (env) => String(env.CLAUDE_PID ?? "").trim() || walkedPid;

/**
 * This window's owner id: `<pid>@<start>`, the bare pid when the start time
 * cannot be read in time, or "" when the window cannot be told. Never throws.
 */
export function ownerId(env = process.env, { table, readTable, timeout } = {}) {
  const injected = Boolean(table || readTable);
  const left = budget(env, timeout, { self: true });
  const fromEnv = String(env.CLAUDE_PID ?? "").trim();
  if (fromEnv) {
    if ((!injected && walkOff(env)) || !pidAlive(fromEnv)) return fromEnv;
    const lookup = lookupFrom({ table, readTable, left });
    return withStart(fromEnv, lookup?.(fromEnv));
  }
  if (!injected && walkOff(env)) return "";
  const lookup = lookupFrom({ table, readTable, tree: true, left });
  const row = lookup ? ancestorRow(process.pid, lookup) : null;
  if (!row) return "";
  walkedPid = String(row[0]);
  return withStart(walkedPid, row);
}

/**
 * The window a terminal the clear-resume extension opened was given in
 * CLEAR_RESUME_WINDOW, `{ pid, start }`, or null when unset or malformed.
 */
export function givenWindow(env = process.env) {
  const m = /^(\d+)@(\d+)$/.exec(String(env.CLEAR_RESUME_WINDOW ?? "").trim());
  return m ? { pid: m[1], start: Number(m[2]) } : null;
}

/**
 * The VS Code window this session runs in, `{ pid, start }`: the parent of the
 * Claude process, which is that window's extension host (measured with Claude
 * Code 2.1.284). The clear-resume extension runs in the same host, so its
 * process.pid names the same window. null when it cannot be read; in a terminal
 * the parent is a shell, which no extension will ever match. A terminal the
 * extension opened names its window in CLEAR_RESUME_WINDOW (`<pid>@<start>`),
 * which wins over the walk.
 */
export function hostWindow(env = process.env, { table, readTable, timeout } = {}) {
  const given = givenWindow(env);
  if (given) return given;
  const lookup = lookupFrom({ table, readTable, tree: true, left: budget(env, timeout) });
  if (!lookup) return null;
  const claude = String(env.CLAUDE_PID ?? "").trim() || String(ancestorRow(process.pid, lookup)?.[0] ?? "");
  const ppid = String(lookup(claude)?.[1] ?? "");
  if (!claude || !ppid) return null;
  return { pid: ppid, start: startOf(lookup(ppid)) };
}

/**
 * Whether another Claude window that is still open owns a handover.
 *
 * - A dead pid, or this window's own pid, is not another open window. A bare
 *   pid equal to this window's is either this window's own handover from before
 *   the start time was recorded, or a closed window's whose pid this one got.
 * - With a start time, the pid's process must have started then (within a second).
 * - A bare pid must still name a Claude-shaped process.
 * - A lookup that fails or times out, a pid missing from the table, or the lookup
 *   turned off (CLEAR_RESUME_NO_PROCESS_WALK) answers open.
 */
export function ownerOpen(owner, { table, readTable, env = process.env, timeout } = {}) {
  const { pid, start } = parseOwner(owner);
  if (!pid || pid === myPid(env) || !pidAlive(pid)) return false;
  if (!table && !readTable && walkOff(env)) return true;
  const row = lookupFrom({ table, readTable, left: budget(env, timeout) })?.(pid);
  if (!row) return true;
  const seen = startOf(row);
  if (start != null && seen != null) return Math.abs(seen - start) <= START_SLACK_MS;
  return isClaudeHost(row[2]);
}

/** Whether a process with this pid exists. */
export function pidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
