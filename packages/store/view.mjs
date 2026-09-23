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
