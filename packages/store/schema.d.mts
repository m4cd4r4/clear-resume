export interface Handover {
  schema: number;
  id: string;
  title: string;
  body: string;
  resumePrompt: string;
  repo: string;
  repoPath: string;
  branch: string;
  machine: string;
  pid: string;
  createdAt: string;
  archivedAt?: string;
  deletedAt?: string;
  updatedAt: string;
  status: "waiting" | "archived" | "deleted";
  pinned: boolean;
  source: string;
  /** Present on records that came from the store; absent on an input literal. */
  path?: string;
  [key: string]: unknown;
}

export const SCHEMA_VERSION: number;
export const STATUSES: readonly ("waiting" | "archived" | "deleted")[];
export const STALE_AFTER_DAYS: number;
export const DELETE_ARCHIVED_AFTER_DAYS: number;
export const PURGE_TOMBSTONE_AFTER_DAYS: number;

export function fileStamp(date: Date | string): string;
export function safeToken(s: unknown, fallback: string): string;
export function recordId(r: { machine: unknown; pid: unknown; createdAt: Date | string }): string;
export function fileName(record: Partial<Handover>): string;
export function parseId(id: string): { machine: string; pid: string; stamp: string } | null;
export function normalise(input: Partial<Handover>, now?: Date): Handover;
export function normalisePath(p: string): string;
export function ageDays(record: Handover, now?: Date): number;
export function isStale(record: Handover, now?: Date): boolean;
export function isExpired(record: Handover, now?: Date): boolean;
export function isPurgeable(record: Handover, now?: Date): boolean;
export function isTombstone(record: Partial<Handover> | undefined): boolean;
