// Grouping and labelling, shared so the VS Code tree and the plugin's CLI picker
// order handovers the same way. No UI framework here - the callers render.
import { isStale, normalisePath } from "./schema.mjs";

export const GROUPS = [
  { id: "current", label: "Current repo" },
  { id: "other", label: "Other repos" },
  { id: "stale", label: "Stale" },
  { id: "archived", label: "Archived" },
];

/**
 * Bucket records for display. Order matters: a record falls into the first bucket
 * that claims it, so an archived record never also shows as stale.
 *
 * Empty groups are dropped - a tree of four headings and one row reads worse than
 * one heading and one row.
 */
export function group(records, { repoPath = "", now = new Date(), roots = [] } = {}) {
  const here = normalisePath(repoPath);
  // A handover written in a git worktree carries that worktree's path, so an exact
  // match files it under "Other repos" while its row still reads the repo's name.
  // The caller passes every checkout of the open repo and they all count as here.
  const mine = [...new Set([here, ...roots.map(normalisePath)].filter(Boolean))];
  const buckets = { current: [], other: [], stale: [], archived: [] };

  for (const r of records) {
    // Tombstones are not a group. listAll already drops them; this is the
    // guard for a caller that passed records it read itself.
    if (r.status === "deleted") continue;
    if (r.status === "archived") buckets.archived.push(r);
    else if (isStale(r, now)) buckets.stale.push(r);
    else if (isUnder(normalisePath(r.repoPath), mine)) buckets.current.push(r);
    else buckets.other.push(r);
  }

  return GROUPS.map((g) => ({ ...g, records: buckets[g.id] })).filter((g) => g.records.length > 0);
}


// The trailing separator is what stops "app-ship-preview" counting as a child of
// "app". A worktree that IS a sibling is matched by its own entry in mine.
function isUnder(path, mine) {
  return mine.some((root) => path === root || path.startsWith(root + "/"));
}

/** "3h" / "2d" / "5w" - short enough for a tree row's description column. */
export function shortAge(record, now = new Date()) {
  const ms = new Date(now).getTime() - new Date(record.createdAt).getTime();
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}

/** Row subtitle: repo, branch when there is one, then age. */
export function describe(record, now = new Date()) {
  return [record.repo, record.branch, shortAge(record, now)].filter(Boolean).join(" · ");
}

// ---- loaded handovers --------------------------------------------------------
//
// After /clear the loaded handover is in Claude's context and nowhere a person can
// see. The extension shows the ones loaded in the last day (a Loaded group, and a
// status-bar item for the open repo), each opening its readable copy (loaded.mjs).

export const LOADED_WINDOW_MS = 24 * 3_600_000;

// Loaded means archived by the SessionStart hook or by load.mjs: not a save that
// superseded it, and not a resume from this sidebar, which the user did by hand.
const LOADED_VIA = new Set(["hook", "load"]);
const loadedAt = (record) => Date.parse(record.archivedAt ?? "");

// How far ahead of this machine's clock a load may be dated and still count: a
// few minutes of skew between synced machines. A load stamped hours ahead read
// "loaded just now", sorted above real ones and outstayed the day (2026-09-28).
const LOADED_SKEW_MS = 5 * 60_000;

/** Handovers a session loaded within `withinMs` (a day), newest first. */
export function recentlyLoaded(records, { now = new Date(), withinMs = LOADED_WINDOW_MS } = {}) {
  const t = new Date(now).getTime();
  const inWindow = (r) => {
    const age = t - loadedAt(r);
    return Number.isFinite(age) && age >= -LOADED_SKEW_MS && age <= withinMs;
  };
  return records
    .filter((r) => r.status === "archived" && LOADED_VIA.has(r.archivedBy?.via))
    .filter(inWindow)
    .sort((a, b) => loadedAt(b) - loadedAt(a));
}

/**
 * The groups the sidebar shows, top to bottom. Loaded comes first and shows
 * whatever `showArchived` says: it is what a person looks for after /clear. Its
 * handovers are archived, so with archived shown they appear in Archived too.
 */
export function treeGroups(records, { repoPath = "", roots = [], now = new Date(), showArchived = false } = {}) {
  const loaded = recentlyLoaded(records, { now });
  const rest = group(records, { repoPath, roots, now }).filter((g) => g.id !== "archived" || showArchived);
  return loaded.length ? [{ id: "loaded", label: "Loaded", records: loaded }, ...rest] : rest;
}

/** "loaded just now" / "loaded 25m ago" / "loaded 3h ago": a Loaded row's subtitle. */
export function loadedAge(record, now = new Date()) {
  const mins = Math.max(0, Math.round((new Date(now).getTime() - loadedAt(record)) / 60000));
  if (!Number.isFinite(mins) || mins < 1) return "loaded just now";
  if (mins < 60) return `loaded ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `loaded ${hours}h ago`;
  return `loaded ${Math.round(hours / 24)}d ago`;
}

// A status bar has little room. Cut at a word where one is near.
function shorten(s, max) {
  const chars = [...String(s ?? "").replace(/\s+/g, " ").trim()];
  if (chars.length <= max) return chars.join("");
  let cut = chars.slice(0, max - 3).join("");
  const space = cut.lastIndexOf(" ");
  if (chars[max - 3] !== " " && space > max / 2) cut = cut.slice(0, space);
  return `${cut.trimEnd()}...`;
}

/**
 * The handover the status bar names: the newest one loaded within the window in
 * the open folder, or failing that in one of the repo's other worktrees. Null with
 * no folder open or nothing loaded there.
 *
 * The open folder comes first. Two windows on two worktrees of one repo each load
 * their own handover, and counting the worktrees alike named whichever loaded
 * last in both status bars (2026-09-28).
 *
 * Two windows on the SAME folder are told apart by `owned(record)`: true when this
 * window's session loaded it, false when another window's live session did, null
 * when nobody can say. This window's load wins, another window's never shows, and
 * an unknown one is the fallback (2026-10-04).
 */
export function loadedHere(records, { repoPath = "", roots = [], now = new Date(), withinMs, owned } = {}) {
  const here = normalisePath(repoPath);
  const mine = [...new Set([here, ...roots.map(normalisePath)].filter(Boolean))];
  if (!repoPath || !mine.length) return null;
  const recent = recentlyLoaded(records, { now, withinMs }).filter((r) => owned?.(r) !== false);
  const first = (rs) =>
    rs.find((r) => isUnder(normalisePath(r.repoPath), [here])) ?? rs.find((r) => isUnder(normalisePath(r.repoPath), mine)) ?? null;
  return first(recent.filter((r) => owned?.(r) === true)) ?? first(recent);
}

/**
 * `loadedHere` across every folder of a workspace (`{ repoPath, roots }` each):
 * the newest load any of them names, this window's own before an unknown one. A
 * multi-root workspace whose handover was loaded in its second folder otherwise
 * showed no status item at all.
 */
export function loadedInFolders(records, folders = [], { now = new Date(), withinMs, owned } = {}) {
  const rank = (r) => (owned?.(r) === true ? 1 : 0);
  let best = null;
  for (const { repoPath, roots = [] } of folders) {
    const r = loadedHere(records, { repoPath, roots, now, withinMs, owned });
    if (r && (!best || rank(r) - rank(best) || loadedAt(r) - loadedAt(best)) > 0) best = r;
  }
  return best;
}

/** The status-bar text: `Handover: <title> (loaded 3h ago)`. */
export function statusText(record, now = new Date(), max = 50) {
  return `Handover: ${shorten(record.title, max)} (${loadedAge(record, now)})`;
}
