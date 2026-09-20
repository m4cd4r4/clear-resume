// Reader and writer for the unified handover store. Every consumer - the plugin's
// hooks, the VS Code extension, the migration - goes through here, so the on-disk
// shape is defined in exactly one place.
//
//   <root>/handovers/<machine>-<pid>-<iso>.json
//
// Flat, one file per handover. Status lives in the record, not the directory, so a
// status change is a rewrite of one file rather than a cross-directory rename that
// two machines could race.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileName, isExpired, normalise, recordId } from "./schema.mjs";

export function storeRoot(env = process.env) {
  return env.CLEAR_RESUME_HOME ? resolve(env.CLEAR_RESUME_HOME) : join(homedir(), ".clear-resume");
}

export function handoversDir(root = storeRoot()) {
  return join(root, "handovers");
}

/** Write a record. Same machine + pid + instant overwrites, so a retry is idempotent. */
export function save(input, { root = storeRoot(), now = new Date() } = {}) {
  const record = normalise(input, now);
  const dir = handoversDir(root);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, fileName(record));
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return { ...record, path };
}

/** The id a record WOULD get, without writing it. Lets a caller ask "already here?". */
export function recordIdFor({ machine, pid, createdAt }) {
  return recordId({ machine, pid, createdAt });
}

export function exists(id, root = storeRoot()) {
  return existsSync(join(handoversDir(root), `${id}.json`));
}

export function read(id, root = storeRoot()) {
  const path = join(handoversDir(root), `${id}.json`);
  if (!existsSync(path)) throw new Error(`no handover with id ${id}`);
  return { ...normalise(JSON.parse(readFileSync(path, "utf8"))), path };
}

/** Rewrite one record in place. `id` is derived from fields that never change, so
 * the filename is stable across mutations. */
export function update(id, patch, { root = storeRoot() } = {}) {
  const current = read(id, root);
  const next = normalise({ ...current, ...patch, id });
  writeFileSync(current.path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { ...next, path: current.path };
}

/** Resume archives immediately - the first of the four clutter-control rules. */
export function archiveRecord(id, { root = storeRoot(), now = new Date() } = {}) {
  return update(id, { status: "archived", archivedAt: new Date(now).toISOString() }, { root });
}

/** Delete one record. Returns false rather than throwing when it is already gone,
 * so two windows deleting the same row do not produce an error dialog. */
export function remove(id, { root = storeRoot() } = {}) {
  const path = join(handoversDir(root), `${id}.json`);
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  return true;
}

/** Pinned records are exempt from the stale and delete timers. */
export function setPinned(id, pinned, { root = storeRoot() } = {}) {
  return update(id, { pinned: pinned === true }, { root });
}

/**
 * Every record in the store, newest first. A file that will not parse is skipped:
 * one bad write must never blank the whole tree.
 */
export function listAll(root = storeRoot()) {
  const dir = handoversDir(root);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const path = join(dir, file);
    try {
      out.push({ ...normalise(JSON.parse(readFileSync(path, "utf8"))), path });
    } catch {
      // Unreadable or pre-schema file - leave it on disk, keep it out of the list.
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Drop archived records past their 30-day window. Pinned records are exempt and a
 * waiting record is never deleted however old - it only falls to the Stale group.
 * Returns the ids removed, so a caller can log what it threw away.
 */
export function prune({ root = storeRoot(), now = new Date() } = {}) {
  const removed = [];
  for (const record of listAll(root)) {
    if (!isExpired(record, now)) continue;
    if (remove(record.id, { root })) removed.push(record.id);
  }
  return removed;
}
