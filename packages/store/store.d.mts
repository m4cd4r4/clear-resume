import type { Handover } from "./schema.d.mts";
export type { Handover };

export interface StoredHandover extends Handover {
  path: string;
}

export function storeRoot(env?: Record<string, string | undefined>): string;
export function handoversDir(root?: string): string;
export function recordIdFor(r: { machine: unknown; pid: unknown; createdAt: Date | string }): string;
export function exists(id: string, root?: string): boolean;
export function read(id: string, root?: string): StoredHandover;
export function update(id: string, patch: Partial<Handover>, opts?: { root?: string }): StoredHandover;
export function archiveRecord(id: string, opts?: { root?: string; now?: Date }): StoredHandover;
export function remove(id: string, opts?: { root?: string }): boolean;
export function setPinned(id: string, pinned: boolean, opts?: { root?: string }): StoredHandover;
export function save(input: Partial<Handover>, opts?: { root?: string; now?: Date }): StoredHandover;
export function listAll(root?: string): StoredHandover[];
export function prune(opts?: { root?: string; now?: Date }): string[];
