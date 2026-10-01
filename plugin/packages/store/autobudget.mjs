// The auto-continue budget of one VS Code window: how many more times a session
// in it may hand over and have the extension open the next conversation by itself.
//
// A window is its extension host, `{ pid, start }`. Every Claude process in a
// window is a child of that host, and the clear-resume extension runs in it too,
// so a hook (parent of CLAUDE_PID) and the extension (process.pid) name the same
// window with no IPC. The start time guards against a closed window's pid being
// handed to a new process.
//
// Files live under `.nudged/windows/`, not beside the handovers: a synced store's
// .gitignore lists only `.nudged/` and is never rewritten, and a budget is this
// machine's alone.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const START_SLACK_MS = 1000;
const dir = (root) => join(root, ".nudged", "windows");
const file = (root, win) => join(dir(root), `${String(win.pid).replace(/\D/g, "")}.json`);

/** The file holding a window's budget, for a watcher. */
export const budgetFile = file;

/** What `/auto on` and the status bar's middle step set. */
export const DEFAULT_BUDGET = 3;
const MAX_BUDGET = 99;

/** A budget from `/auto <arg>`: 0 for off, a count, or "unlimited". Throws on anything else. */
export function parseBudget(arg) {
  const s = String(arg ?? "").trim().toLowerCase();
  if (s === "off") return 0;
  if (s === "on") return DEFAULT_BUDGET;
  if (s === "unlimited") return "unlimited";
  if (/^\d+$/.test(s) && Number(s) <= MAX_BUDGET) return Number(s);
  throw new Error(`Expected off, on, unlimited or a number from 0 to ${MAX_BUDGET}, got "${String(arg ?? "")}".`);
}

/** Set a window's budget (a count, or "unlimited") and reset what it has used. */
export function setBudget(root, win, budget, { now = new Date() } = {}) {
  mkdirSync(dir(root), { recursive: true });
  const record = { pid: String(win.pid), start: win.start ?? null, budget, used: 0, set: now.toISOString() };
  writeFileSync(file(root, win), JSON.stringify(record, null, 2), "utf8");
  return readBudget(root, win);
}

// The window's record as written, or null when there is none for this window.
function readRecord(root, win) {
  const path = file(root, win);
  if (!existsSync(path)) return null;
  let r;
  try {
    r = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  // Starts read by different tools round differently; a second of slack, as owner.mjs.
  if (r.start != null && win.start != null && Math.abs(Number(r.start) - Number(win.start)) > START_SLACK_MS) return null;
  return r;
}

function view(r) {
  const used = Number(r.used) || 0;
  const left = r.budget === "unlimited" ? Infinity : Math.max(0, Number(r.budget) - used);
  return { budget: r.budget, used, left };
}

/** A window's budget, what it has used and what is left; null when none is set. */
export function readBudget(root, win) {
  const r = readRecord(root, win);
  return r ? view(r) : null;
}

/** The status-bar text for a window's budget (from readBudget, or null). */
export function budgetLabel(state) {
  if (!state || state.budget === 0) return "auto: off";
  if (state.budget === "unlimited") return "auto: unlimited";
  return `auto: ${state.left} of ${state.budget} left`;
}

/** What a status-bar click sets next: off, then DEFAULT_BUDGET, then unlimited, then off. */
export function nextBudget(state) {
  if (!state || state.budget === 0) return DEFAULT_BUDGET;
  if (state.budget === "unlimited") return 0;
  return "unlimited";
}

// The stall guard, as the headless runner's: two continued sessions in a row
// that made no commit stop the chain, whatever budget is left.
const STALL_LIMIT = 2;
const strikes = (r, head) => (head && r.lastHead === head ? (Number(r.stalled) || 0) + 1 : 0);

/**
 * Whether continuing now, with the repo at `head`, would stall: the session that
 * the last continue opened made no commit, and neither did the one before it.
 * A missing HEAD (not a git repo) never stalls.
 */
export function stalls(root, win, head) {
  const r = readRecord(root, win);
  return Boolean(r) && strikes(r, head) >= STALL_LIMIT;
}

/**
 * Spend one continue, recording the repo's HEAD as the new session starts so the
 * next continue can tell whether it committed anything. Returns the budget after
 * it, or null when none was left.
 */
export function takeOne(root, win, head = null) {
  const r = readRecord(root, win);
  if (!r || view(r).left <= 0) return null;
  r.stalled = strikes(r, head);
  r.lastHead = head || null;
  r.used = (Number(r.used) || 0) + 1;
  writeFileSync(file(root, win), JSON.stringify(r, null, 2), "utf8");
  return view(r);
}

/**
 * The handover this window should continue by itself: the oldest waiting record
 * stamped auto with this window (`<pid>@<start>`, a second of slack on the start)
 * and saved on this machine, or null. Pids are per machine, so a synced record
 * from another machine never matches.
 */
export function autoContinueFor(records, win, machine) {
  const mine = (r) => {
    if (r.status !== "waiting" || r.auto !== true || r.machine !== machine) return false;
    const [pid, start] = String(r.window ?? "").split("@");
    if (pid !== String(win.pid)) return false;
    return start == null || win.start == null || Math.abs(Number(start) - Number(win.start)) <= START_SLACK_MS;
  };
  const found = records.filter(mine).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return found[0] ?? null;
}
