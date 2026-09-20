// Reader and writer for the unified handover store. Every consumer - the plugin's
// hooks, the VS Code extension, the migration - goes through here, so the on-disk
// shape is defined in exactly one place.
//
//   <root>/handovers/<machine>-<pid>-<iso>.json
//
// Flat, one file per handover. Status lives in the record, not the directory, so a
// status change is a rewrite of one file rather than a cross-directory rename that
// two machines could race.
//
// Nothing here ever unlinks a record a user can still see. A delete writes a
// tombstone and only the prune, ninety days later, removes the file - otherwise a
// synced copy on another machine puts the record straight back.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileName, isExpired, isPurgeable, normalise, recordId } from "./schema.mjs";

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

  // Ids carry milliseconds, so two saves from one process landing on the same id
  // needs them inside the same millisecond. This loop is the backstop for that:
  // re-saving the SAME handover must still overwrite (a retry is not a new
  // record), but a different one takes the next free suffix. An id collision here
  // is silent data loss, which is how the migration lost four records before the
  // stamp was widened.
  let path = join(dir, fileName(record));
  for (let n = 2; existsSync(path) && !sameHandover(path, record); n++) {
    record.id = `${recordId(record)}-${n}`;
    path = join(dir, `${record.id}.json`);
  }

  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return { ...record, path };
}

/** True when the file already holds this handover, so writing it is a retry. */
function sameHandover(path, record) {
  try {
    const existing = JSON.parse(readFileSync(path, "utf8"));
    return existing.title === record.title && existing.body === record.body;
  } catch {
    return false; // unreadable or half-written: treat as occupied, take a new id
  }
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
 * the filename is stable across mutations.
 *
 * `updatedAt` is stamped on every write. When two machines have both rewritten one
 * record, that field is what decides which version survives the merge. */
export function update(id, patch, { root = storeRoot(), now = new Date() } = {}) {
  const current = read(id, root);
  const next = normalise({ ...current, ...patch, id, updatedAt: new Date(now).toISOString() }, now);
  writeFileSync(current.path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { ...next, path: current.path };
}

/** Resume archives immediately - the first of the four clutter-control rules. */
export function archiveRecord(id, { root = storeRoot(), now = new Date() } = {}) {
  return update(id, { status: "archived", archivedAt: new Date(now).toISOString() }, { root, now });
}

/** Pinned records are exempt from the stale, archive and purge timers. */
export function setPinned(id, pinned, { root = storeRoot(), now = new Date() } = {}) {
  return update(id, { pinned: pinned === true }, { root, now });
}

/**
 * Delete one record: the body is dropped and the record becomes a tombstone.
 *
 * The file stays. Unlinking it would mean any machine still holding the original
 * restores it on the next sync, forever - a delete has to be something the other
 * machine can be TOLD about, which means it has to be a write.
 *
 * Returns false rather than throwing when the record is already gone or already a
 * tombstone, so two windows deleting the same row do not produce an error dialog.
 */
export function remove(id, { root = storeRoot(), now = new Date() } = {}) {
  if (!exists(id, root)) return false;
  let current;
  try {
    current = read(id, root);
  } catch {
    return false;
  }
  if (current.status === "deleted") return false;
  update(id, { status: "deleted", body: "", resumePrompt: "", deletedAt: new Date(now).toISOString() }, { root, now });
  return true;
}

/** Unlink a record for real. Only the prune calls this, and only on old tombstones. */
function unlink(id, root) {
  const path = join(handoversDir(root), `${id}.json`);
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  return true;
}

/**
 * Every record in the store, newest first. A file that will not parse is skipped:
 * one bad write must never blank the whole tree.
 *
 * Tombstones are left out unless asked for. They exist for the sync and the prune,
 * not for anything a person looks at.
 */
export function listAll(root = storeRoot(), { includeDeleted = false } = {}) {
  const dir = handoversDir(root);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const path = join(dir, file);
    try {
      const record = { ...normalise(JSON.parse(readFileSync(path, "utf8"))), path };
      if (record.status === "deleted" && !includeDeleted) continue;
      out.push(record);
    } catch {
      // Unreadable or pre-schema file - leave it on disk, keep it out of the list.
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Two-stage clutter control.
 *
 * An archived record past its 30-day window becomes a tombstone rather than
 * disappearing, so the other machine learns it went. A tombstone past its 90-day
 * window is finally unlinked - a machine that has been offline longer than that
 * will resurrect the record, which is the price of not keeping tombstones forever.
 *
 * Pinned records are exempt from both, and a waiting record is never deleted
 * however old: it only falls to the Stale group.
 *
 * Returns the ids that left the visible tree, so a caller can log what it tidied.
 */
export function prune({ root = storeRoot(), now = new Date() } = {}) {
  const affected = [];
  for (const record of listAll(root, { includeDeleted: true })) {
    if (isExpired(record, now)) {
      remove(record.id, { root, now });
      affected.push(record.id);
    } else if (isPurgeable(record, now)) {
      if (unlink(record.id, root)) affected.push(record.id);
    }
  }
  return affected;
}
