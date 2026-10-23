// What the sidebar page draws, built from the store's records. No vscode import and
// no I/O, so vitest runs it directly. Every string here comes from handover data or
// from the labels the tree views already used.
import type { StoredHandover } from "../../plugin/packages/store/store.mjs";
import { loadedAge, loadedHere, shortAge, treeGroups } from "../../plugin/packages/store/view.mjs";
import { normalisePath } from "../../plugin/packages/store/schema.mjs";
import { stamp, type Lane, type NextUp } from "../../plugin/packages/store/lanes.mjs";

export type RowKind = "waiting" | "loaded" | "archived";

export interface RowModel {
  /** Unique within the page; a record can sit in Loaded and Archived at once. */
  key: string;
  /** The handover's id, which the host looks the record up by. */
  id: string;
  title: string;
  /** Repo and branch. */
  meta: string;
  /** One line: the group heading already names the repo, so `meta` stays off the row (tooltip and peek only). */
  compact: boolean;
  /** "3h", or "loaded 25m ago" on a Loaded row. */
  age: string;
  /** 1 for a fresh handover down to FADE_FLOOR for an old one. */
  fade: number;
  kind: RowKind;
  pinned: boolean;
  /** The first lines of the handover's Next action, or of its body. */
  peek: string[];
  /** What the search box matches: title, repo and branch, even where the row shows one. */
  search: string;
}

export interface SectionModel {
  id: string;
  /** Empty when a lone group needs no heading. */
  label: string;
  /** Closed until the person opens it; their own choice overrides this. */
  collapsed?: boolean;
  rows: RowModel[];
  /** The same rows split by repo. Other repos, Stale and Archived have them; Stale and Archived start closed. */
  groups?: { id: string; label: string; collapsed?: boolean; rows: RowModel[] }[];
}

export interface LaneModel {
  key: string;
  title: string;
  main: boolean;
  /** "started 10-04 11:50 · handover waiting 3h · ux-plan #4/4". */
  meta: string;
  why: string;
  path: string;
  /** What the open-window command receives: the lane's .code-workspace, else its folder. */
  target: string;
  /** The lane's newest handover when it is waiting: Resume acts on it in place. */
  resumable: RowModel | null;
  handovers: RowModel[];
}

export interface NextModel {
  key: string;
  title: string;
  meta: string;
  why: string;
}

export interface LanesModel {
  lanes: LaneModel[];
  next: NextModel[];
}

/** Oldest handovers fade to this, so they recede without vanishing. */
export const FADE_FLOOR = 0.4;
const FADE_DAYS = 14;

export function fadeOf(createdAt: string, now: Date): number {
  const days = (now.getTime() - new Date(createdAt).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days <= 0) return 1;
  return Math.max(FADE_FLOOR, 1 - (days / FADE_DAYS) * (1 - FADE_FLOOR));
}

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/**
 * The lines that say what the handover is for: its "Next action" section, else the
 * first lines under its title. At most three, each cut to fit a narrow sidebar.
 */
export function peekOf(body: string, lines = 3): string[] {
  const text = String(body ?? "");
  const m = text.match(/(?:^|\n)##\s+Next action[^\S\n]*\r?\n([\s\S]*?)(?=\r?\n##\s|$)/i);
  const source = m ? m[1] : text.replace(/^#[^\n]*\n/, "");
  return source
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").trim())
    .filter((l) => l && !l.startsWith("#"))
    .slice(0, lines)
    .map((l) => clip(l, 160));
}

/** Whether `needle` stands in `hay` as whole words ("main" is not in "domain"). */
function hasWords(hay: string, needle: string): boolean {
  const h = hay.toLowerCase(), n = needle.toLowerCase();
  for (let i = h.indexOf(n); n && i >= 0; i = h.indexOf(n, i + 1)) {
    if (!/[a-z0-9]/.test(h[i - 1] ?? "") && !/[a-z0-9]/.test(h[i + n.length] ?? "")) return true;
  }
  return false;
}

/**
 * Repo and branch, once each. A worktree is usually named for its branch
 * ("app-ship" on "feat/ship"), so when the branch's last segment is already in the
 * repo name only the repo shows, and when the branch already holds the repo name only
 * the branch does.
 */
function where(r: Pick<StoredHandover, "repo" | "branch">): string {
  const repo = r.repo ?? "", branch = r.branch ?? "";
  if (repo && branch) {
    if (hasWords(repo, branch.split("/").pop() ?? "")) return repo;
    if (hasWords(branch, repo)) return branch;
  }
  return [repo, branch].filter(Boolean).join(" · ");
}

export function rowOf(r: StoredHandover, now: Date, opts: { loaded?: boolean; prefix?: string; compact?: boolean } = {}): RowModel {
  const loaded = opts.loaded === true;
  return {
    key: `${opts.prefix ?? (loaded ? "loaded" : "h")}:${r.id}`,
    id: r.id,
    title: r.title,
    meta: where(r),
    compact: opts.compact === true,
    age: loaded ? loadedAge(r, now) : shortAge(r, now),
    fade: loaded ? 1 : fadeOf(r.createdAt, now),
    kind: loaded ? "loaded" : r.status === "archived" ? "archived" : "waiting",
    pinned: r.pinned === true,
    peek: peekOf(r.body),
    search: [r.title, r.repo, r.branch].filter(Boolean).join(" "),
  };
}

/** Top to bottom: what is waiting for a person, then what a session loaded, then the rest. */
const ORDER = ["current", "other", "loaded", "stale", "archived"];
/** Right after /clear, what this window just resumed comes first. */
const LOADED_FIRST = ["loaded", "current", "other", "stale", "archived"];
/** Finished or old: closed until opened, so a thousand archived rows cost one line. */
const COLLAPSED = new Set(["stale", "archived"]);

/**
 * Stale and Archived hold hundreds of rows, so they split by repo. A row's repo is its
 * main checkout, not its worktree: forty `examworthy-seal-*` worktrees are one repo.
 * A record written before `mainPath` existed falls back to its own folder. Newest
 * repo first, newest row first inside it.
 */
const BY_REPO = new Set(["other", "stale", "archived"]);

function byRepo(records: StoredHandover[], now: Date, collapsed: boolean): SectionModel["groups"] {
  const newest = [...records].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const groups = new Map<string, { id: string; label: string; collapsed: boolean; rows: RowModel[] }>();
  for (const r of newest) {
    const path = normalisePath(String(r.mainPath || r.repoPath || ""));
    let g = groups.get(path);
    if (!g) groups.set(path, (g = { id: path, label: path.split("/").filter(Boolean).pop() || "unknown", collapsed, rows: [] }));
    g.rows.push(rowOf(r, now, { compact: true }));
  }
  return [...groups.values()];
}

/** The Handovers section: the tree's groups, waiting ones first, as rows. */
export function handoverSections(
  records: StoredHandover[],
  opts: { repoPath: string; roots: string[]; now: Date; showArchived: boolean },
): SectionModel[] {
  // Loaded leads only when one is from the open repo or its worktrees; another
  // project's load stays below what is waiting here.
  const order = loadedHere(records, opts) ? LOADED_FIRST : ORDER;
  const groups = treeGroups(records, opts).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const sections = groups.map((g) => ({
    id: g.id,
    label: g.label,
    collapsed: COLLAPSED.has(g.id),
    // Loaded mixes repos under one heading, so its rows keep the repo on a second line.
    rows: g.records.map((r) => rowOf(r, opts.now, { loaded: g.id === "loaded", compact: g.id !== "loaded" })),
    ...(BY_REPO.has(g.id) ? { groups: byRepo(g.records, opts.now, COLLAPSED.has(g.id)) } : {}),
  }));
  // One group alone needs no heading, except Loaded, whose heading says these rows
  // were loaded and are not waiting, and a collapsed one, which needs its heading to open.
  // A section with repo groups under it keeps its heading, or those groups hang from nothing.
  if (sections.length === 1 && sections[0].id !== "loaded" && !sections[0].collapsed && !sections[0].groups) sections[0].label = "";
  return sections;
}

export function lanesModel(
  data: { lanes: Lane[]; next: NextUp[] },
  opts: { now: Date; targetOf: (lane: Lane) => string },
): LanesModel {
  const lanes = data.lanes.map((lane): LaneModel => {
    const handovers = lane.handovers.map((r) => rowOf(r, opts.now, { prefix: `lane:${lane.path}` }));
    const newest = lane.handovers[0];
    return {
      key: `lane:${lane.path}`,
      // The home icon marks the main checkout, so its label is only the branch.
      title: lane.main ? lane.title : `${lane.seq}. ${lane.title}`,
      main: lane.main,
      meta: [lane.startedAt && `started ${stamp(lane.startedAt)}`, lane.state, lane.context].filter(Boolean).join(" · "),
      why: lane.why,
      path: lane.path,
      target: opts.targetOf(lane),
      resumable: newest?.status === "waiting" ? handovers[0] : null,
      handovers,
    };
  });
  const next = data.next.map((n, i): NextModel => ({
    key: `next:${i}`,
    title: n.short,
    meta: [n.context, n.queuedAt && `queued ${stamp(n.queuedAt)}`].filter(Boolean).join(" · "),
    why: n.entry.why || "",
  }));
  return { lanes, next };
}

/** Whether text matches the search box: every word of the query appears in it. */
export function matches(text: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = text.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Rows whose title, repo or branch match; a group left empty drops out. */
export function filterSections(sections: SectionModel[], query: string): SectionModel[] {
  if (!query.trim()) return sections;
  return sections
    .map((s) => ({
      ...s,
      rows: s.rows.filter((r) => matches(r.search, query)),
      ...(s.groups
        ? { groups: s.groups.map((g) => ({ ...g, rows: g.rows.filter((r) => matches(r.search, query)) })).filter((g) => g.rows.length > 0) }
        : {}),
    }))
    .filter((s) => s.rows.length > 0);
}
