export interface SyncResult {
  ok: boolean;
  /** Ids whose conflicting rewrites were settled by `updatedAt`. */
  resolved?: string[];
  /** Why it did nothing. Offline and not-set-up are normal states, not errors. */
  reason?: string;
}

export function isSynced(root?: string): boolean;
export function initSync(root: string, remote: string, opts?: { now?: Date }): SyncResult;
export function commitLocal(root?: string, opts?: { now?: Date }): { ok: boolean; committed: boolean; reason?: string };
export function pull(root?: string): SyncResult;
export function resolveConflicts(root?: string): string[] | null;
export function sync(root?: string, opts?: { now?: Date }): SyncResult;
