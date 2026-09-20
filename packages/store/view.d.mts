import type { StoredHandover } from "./store.d.mts";

export type GroupId = "current" | "other" | "stale" | "archived";

export interface Group {
  id: GroupId;
  label: string;
  records: StoredHandover[];
}

export const GROUPS: { id: GroupId; label: string }[];
export function group(records: StoredHandover[], opts?: { repoPath?: string; now?: Date }): Group[];
export function shortAge(record: StoredHandover, now?: Date): string;
export function describe(record: StoredHandover, now?: Date): string;
