import type { StoredHandover } from "./store.d.mts";

export type GroupId = "loaded" | "current" | "other" | "stale" | "archived";

export interface Group {
  id: GroupId;
  label: string;
  records: StoredHandover[];
}

export const GROUPS: { id: GroupId; label: string }[];
export function group(
  records: StoredHandover[],
  opts?: {
    repoPath?: string;
    now?: Date;
    /** Every checkout of the open repo; a record under any of them counts as current. */
    roots?: string[];
  },
): Group[];
export function shortAge(record: StoredHandover, now?: Date): string;
export function describe(record: StoredHandover, now?: Date): string;

export const LOADED_WINDOW_MS: number;
/** Handovers the SessionStart hook or load.mjs loaded within the window (a day), newest first. */
export function recentlyLoaded(records: StoredHandover[], opts?: { now?: Date; withinMs?: number }): StoredHandover[];
/** The sidebar's groups, with Loaded first whatever `showArchived` says. */
export function treeGroups(
  records: StoredHandover[],
  opts?: { repoPath?: string; roots?: string[]; now?: Date; showArchived?: boolean },
): Group[];
export function loadedAge(record: StoredHandover, now?: Date): string;
/** The newest handover loaded within the window in the open repo or its worktrees. */
export function loadedHere(
  records: StoredHandover[],
  opts?: { repoPath?: string; roots?: string[]; now?: Date; withinMs?: number },
): StoredHandover | null;
/** `loadedHere` across every workspace folder: the newest load any of them names. */
export function loadedInFolders(
  records: StoredHandover[],
  folders: { repoPath: string; roots?: string[] }[],
  opts?: { now?: Date; withinMs?: number },
): StoredHandover | null;
export function statusText(record: StoredHandover, now?: Date, max?: number): string;
