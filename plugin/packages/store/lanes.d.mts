import type { StoredHandover } from "./store.d.mts";

/** A worktree registry entry. Only the fields the lanes read are typed. */
export interface RegistryEntry {
  slug: string;
  branch?: string;
  repo_path?: string | null;
  worktree_path?: string | null;
  status?: string;
  plan?: string | null;
  wave?: number | string | null;
  tags?: string[];
  why?: string;
  label?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface EntryLabel {
  row: string;
  slug: string;
  short: string;
  context: string;
  plan: string;
  seq: number;
  total: number;
  wave: number | null;
}

export interface Worktree {
  path: string;
  branch: string;
  detached: boolean;
  main: boolean;
  startedAt?: string;
}

export interface Lane {
  path: string;
  branch: string;
  main: boolean;
  startedAt: string;
  entry: RegistryEntry | null;
  title: string;
  context: string;
  why: string;
  state: string;
  handovers: StoredHandover[];
  seq?: number;
}

export interface NextUp extends EntryLabel {
  entry: RegistryEntry;
  queuedAt: string;
}

export function rowId(entry: RegistryEntry): string;
export function waveOf(entry: RegistryEntry): number | null;
export function planPosition(entry: RegistryEntry, entries?: RegistryEntry[]): { plan: string; seq: number; total: number } | null;
export function entryLabel(entry: RegistryEntry, entries?: RegistryEntry[]): EntryLabel;
export function stamp(iso: string): string;
export function parseWorktreeList(out: string): Worktree[];
export function laneState(handovers: StoredHandover[], now?: Date): string;
export function lanes(input?: {
  worktrees?: Worktree[];
  entries?: RegistryEntry[];
  records?: StoredHandover[];
  now?: Date;
}): { lanes: Lane[]; next: NextUp[] };
