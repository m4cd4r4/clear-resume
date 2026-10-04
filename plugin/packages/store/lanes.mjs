// Worktrees as lanes: which checkout of a repo started when, what it is for, and
// what its last handover says. Pure functions, so the VS Code tree and the label
// CLI (scripts/label.mjs) agree on every string. Git and the registry file are read
// by the callers.
//
// The registry is optional. It is a JSON file of `{ entries: [...] }` describing
// planned and running worktrees (slug, branch, plan, wave, why, status). Without
// one, a lane is just its branch and the time it was created.
import { loadedAge, recentlyLoaded, shortAge } from "./view.mjs";
import { normalisePath } from "./schema.mjs";

// A plan row named in prose: "UX plan U3: ...", "Wave 2 row 4a", "W2-d", "ticket 12".
const ROW = /\b(U\d+[a-z]?|W\d+-[a-z]+|row \d+[a-z]?|ticket[- ]\d+|slice \d+[a-z]?)\b/i;

/** The plan row an entry implements: its `label`, else the first row id in `why`. */
export function rowId(entry) {
  if (entry?.label && String(entry.label).trim()) return String(entry.label).trim();
  const m = String(entry?.why ?? "").match(ROW);
  return m ? m[1] : "";
}

/** The entry's wave: the `wave` field, else a `wave-2` / `wave2` tag. Null when neither. */
export function waveOf(entry) {
  if (entry?.wave !== undefined && entry?.wave !== null && entry?.wave !== "") return Number(entry.wave);
  for (const t of entry?.tags ?? []) {
    const m = String(t).match(/^wave-?(\d+)$/i);
    if (m) return Number(m[1]);
  }
  return null;
}

const byCreated = (a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));

/**
 * Where an entry sits in its plan: 1-based order of creation among the registry
 * entries sharing its `plan`. This counts worktrees the registry knows about, not
 * rows of the plan document, so it answers "which ran first", not "how far along".
 */
export function planPosition(entry, entries = []) {
  if (!entry?.plan) return null;
  const siblings = entries.filter((e) => e.plan === entry.plan && e.status !== "archived").sort(byCreated);
  const seq = siblings.findIndex((e) => e.slug === entry.slug) + 1;
  return seq ? { plan: entry.plan, seq, total: siblings.length } : null;
}

/**
 * Every string a worktree is called by. `short` heads a tree row and a handover
 * title ("U3 · ux-study-mode"); `context` follows it ("ux-plan #4/4 · wave 2").
 */
export function entryLabel(entry, entries = []) {
  const row = rowId(entry);
  const pos = planPosition(entry, entries);
  const wave = waveOf(entry);
  const short = [row, entry.slug].filter(Boolean).join(" · ");
  const context = [pos && `${pos.plan} #${pos.seq}/${pos.total}`, wave !== null && `wave ${wave}`].filter(Boolean).join(" · ");
  return { row, slug: entry.slug, short, context, plan: pos?.plan ?? "", seq: pos?.seq ?? 0, total: pos?.total ?? 0, wave };
}

/** "10-04 11:50" in local time: a start time short enough for a title bar. */
export function stamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const two = (n) => String(n).padStart(2, "0");
  return `${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/**
 * Parse `git worktree list --porcelain`. The main checkout comes first, the one
 * ordering the format guarantees.
 */
export function parseWorktreeList(out) {
  const list = [];
  let cur = null;
  for (const line of String(out).split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      cur = { path: normalisePath(line.slice(9)), branch: "", detached: false };
      list.push(cur);
    } else if (cur && line.startsWith("branch ")) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
    else if (cur && line === "detached") cur.detached = true;
  }
  return list.map((w, i) => ({ ...w, main: i === 0 }));
}

function findEntry(wt, entries, mainPath) {
  const p = normalisePath(wt.path);
  return (
    entries.find((e) => e.worktree_path && normalisePath(e.worktree_path) === p) ??
    entries.find((e) => wt.branch && e.branch === wt.branch && e.repo_path && normalisePath(e.repo_path) === mainPath) ??
    null
  );
}

/** What a lane's newest handover says about it, for the row's description. */
export function laneState(handovers, now = new Date()) {
  const latest = [...handovers].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (!latest) return "no handover";
  if (latest.status === "waiting") return `handover waiting ${shortAge(latest, now)}`;
  if (recentlyLoaded([latest], { now }).length) return loadedAge(latest, now);
  return `last handover ${shortAge(latest, now)} ago`;
}

/**
 * The lanes of one repo, oldest first, numbered in that order, plus the registry's
 * queued entries for the same repo as "next up".
 *
 * `worktrees` is parseWorktreeList's output, each with `startedAt` (ISO) added by
 * the caller from the filesystem. `records` are handover records; each is filed
 * under the lane whose path it was written in.
 */
export function lanes({ worktrees = [], entries = [], records = [], now = new Date() } = {}) {
  const main = worktrees.find((w) => w.main);
  const mainPath = main ? normalisePath(main.path) : "";
  const live = records.filter((r) => r.status !== "deleted");

  const rows = worktrees.map((wt) => {
    const entry = findEntry(wt, entries, mainPath);
    const label = entry ? entryLabel(entry, entries) : null;
    const p = normalisePath(wt.path);
    const handovers = live
      .filter((r) => normalisePath(r.repoPath) === p)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return {
      path: p,
      branch: wt.branch,
      main: wt.main,
      startedAt: wt.startedAt ?? "",
      entry,
      title: label?.short || wt.branch || (wt.detached ? "detached" : p.split("/").pop()),
      context: label?.context ?? "",
      why: entry?.why ?? "",
      state: laneState(handovers, now),
      handovers,
    };
  });

  // The main checkout heads the list; the worktrees follow in the order they began.
  const others = rows.filter((r) => !r.main).sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  others.forEach((r, i) => (r.seq = i + 1));
  const head = rows.filter((r) => r.main);

  const next = mainPath
    ? entries
        .filter((e) => e.status === "later" && e.repo_path && normalisePath(e.repo_path) === mainPath)
        .sort(byCreated)
        .map((e) => ({ entry: e, ...entryLabel(e, entries), queuedAt: e.created_at ?? "" }))
    : [];

  return { lanes: [...head, ...others], next };
}
