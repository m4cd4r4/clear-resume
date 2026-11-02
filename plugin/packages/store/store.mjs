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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pruneCaptures } from "./artifacts.mjs";
import { fileName, isPurgeable, normalise, recordId } from "./schema.mjs";
import { pruneLoaded } from "./loaded.mjs";
import { adoptLegacyEnv, resolveStore } from "./rename.mjs";

// Before anything reads a variable: a settings file from before the rename keeps working.
adoptLegacyEnv();

export function storeRoot(env = process.env) {
  return resolveStore(env);
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

/**
 * Resume archives immediately - the first of the four clutter-control rules.
 *
 * `by` ({ owner, pid, via }) is stamped as `archivedBy`, so a handover that left
 * the waiting list says what took it.
 */
export function archiveRecord(id, { root = storeRoot(), now = new Date(), by } = {}) {
  const patch = { status: "archived", archivedAt: new Date(now).toISOString() };
  if (by) patch.archivedBy = by;
  return update(id, patch, { root, now });
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
  // deletedBy tells a pull this was asked for: see restoreAgedOut in sync.mjs.
  update(id, { status: "deleted", body: "", resumePrompt: "", deletedAt: new Date(now).toISOString(), deletedBy: "person" }, { root, now });
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
      const record = cachedRecord(path);
      if (record.status === "deleted" && !includeDeleted) continue;
      out.push({ ...record });
    } catch {
      // Unreadable or pre-schema file - leave it on disk, keep it out of the list.
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Parsed records by path, kept while the file's mtime and size are unchanged. The
// extension calls listAll several times per store change in every window, and
// re-parsing ~1,900 files each time (257 ms) froze the extension host (2026-10-29).
const parsed = new Map();

function cachedRecord(path) {
  const { mtimeMs, size } = statSync(path);
  const hit = parsed.get(path);
  if (hit && hit.mtimeMs === mtimeMs && hit.size === size) return hit.record;
  const record = { ...normalise(JSON.parse(readFileSync(path, "utf8"))), path };
  parsed.set(path, { mtimeMs, size, record });
  return record;
}

/**
 * A waiting, unpinned handover written on this machine whose repo folder has been
 * removed: the worktree was finished, so there is nothing left to resume into.
 *
 * Three guards against archiving something live. Another machine's record is left
 * alone (its path will not exist here). The folder's parent must still exist, so an
 * unmounted drive does not read as "gone". And an empty repoPath proves nothing.
 */
function isAbandoned(record) {
  if (record.status !== "waiting" || record.pinned) return false;
  if (!record.repoPath || record.machine !== hostname()) return false;
  const folder = resolve(record.repoPath);
  return !existsSync(folder) && existsSync(dirname(folder));
}

/**
 * Tidy what is no longer part of the record.
 *
 * Age alone never removes a handover, waiting or archived: the store is a lasting
 * record of the work. Only a person deleting one makes a tombstone, and a tombstone
 * past its 90-day window is finally unlinked - a machine that has been offline longer
 * than that will resurrect the record, which is the price of not keeping tombstones
 * forever.
 *
 * The readable copies of loaded handovers (loaded.mjs) and captures no surviving
 * handover names go after 30 days, so those folders never grow without limit.
 *
 * Returns the ids that left the visible tree, so a caller can log what it tidied.
 */
export function prune({ root = storeRoot(), now = new Date() } = {}) {
  const affected = [];
  const records = listAll(root, { includeDeleted: true });
  for (const record of records) {
    if (isPurgeable(record, now)) {
      if (unlink(record.id, root)) affected.push(record.id);
    } else if (isAbandoned(record)) {
      archiveRecord(record.id, { root, now, by: { owner: "", pid: String(process.pid), via: "abandoned" } });
      affected.push(record.id);
    }
  }
  pruneLoaded({ root, now });
  pruneCaptures({ root, now, keep: new Set(records.filter((r) => r.status !== "deleted" && r.sessionId).map((r) => String(r.sessionId))) });
  return affected;
}
