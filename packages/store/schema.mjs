// Unified handover record: ONE schema shared by the plugin (Claude Desktop / CLI)
// and the VS Code extension. A third store is the failure mode this project exists
// to avoid, so every reader and writer goes through here.
//
// Layout: <root>/handovers/<machine>-<pid>-<iso>.json
// Per-file naming by machine and pid means two machines never write the same path,
// so syncing the store cannot produce a create conflict. What it CAN produce is a
// delete that comes back: a record removed on one machine is still a file on the
// other, and the next sync restores it. That is why a delete writes a tombstone
// here rather than unlinking - see `status: "deleted"` below.

export const SCHEMA_VERSION = 1;

/** @typedef {"waiting"|"archived"|"deleted"} HandoverStatus */

// "deleted" is a tombstone: the record stays on disk with its body dropped, so a
// sync from a machine that still holds the original cannot resurrect it.
export const STATUSES = /** @type {const} */ (["waiting", "archived", "deleted"]);

// Clutter control is a requirement, not a nicety. Pinned records are exempt from all three.
export const STALE_AFTER_DAYS = 7;
export const DELETE_ARCHIVED_AFTER_DAYS = 30;
// How long a tombstone is kept before the file is really unlinked. Long, because
// this is the window in which an offline machine can still be told about the
// delete; a machine offline for longer than this resurrects the record.
export const PURGE_TOMBSTONE_AFTER_DAYS = 90;

// Both id shapes: millisecond stamps as written now, and the second-resolution
// stamps the first 500-odd records were written with.
const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3})?Z$/;

/**
 * Filename-safe instant, milliseconds included.
 *
 * Dropping the milliseconds is what made two saves inside one second collide, and
 * an id collision in this store is silent data loss - it ate four records during
 * the migration and one more when a window saved twice in a second.
 */
export function fileStamp(date) {
  return new Date(date).toISOString().replace(/[:.]/g, "-");
}

export function safeToken(s, fallback) {
  const t = String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return t || fallback;
}

/** Record id and filename are the same string minus the extension. */
export function recordId({ machine, pid, createdAt }) {
  return `${safeToken(machine, "unknown")}-${safeToken(pid, "0")}-${fileStamp(createdAt)}`;
}

export function fileName(record) {
  return `${record.id || recordId(record)}.json`;
}

export function parseId(id) {
  const m = /^(.*)-([0-9]+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3})?Z)$/.exec(String(id));
  if (!m || !ISO_STAMP.test(m[3])) return null;
  return { machine: m[1], pid: m[2], stamp: m[3] };
}

/**
 * Fill defaults and coerce types. Throws on the fields a record is useless
 * without; everything else degrades to a sane default so one bad file written by an
 * older version never blanks the tree.
 *
 * A tombstone is the one record allowed an empty body - that is the point of it.
 */
export function normalise(input, now = new Date()) {
  const r = { ...input };
  r.status = STATUSES.includes(r.status) ? r.status : "waiting";

  if (!r.title || !String(r.title).trim()) throw new Error("title is required");
  if (r.status !== "deleted" && (!r.body || !String(r.body).trim())) throw new Error("body is required");
  if (!r.repoPath || !String(r.repoPath).trim()) throw new Error("repoPath is required");

  r.schema = Number(r.schema) || SCHEMA_VERSION;
  r.title = String(r.title).trim();
  r.body = String(r.body || "").replace(/\r\n/g, "\n").trim();
  r.repoPath = normalisePath(r.repoPath);
  r.repo = String(r.repo || basename(r.repoPath) || "unknown");
  r.branch = String(r.branch || "");
  r.machine = String(r.machine || "unknown");
  r.pid = String(r.pid ?? "0");
  r.createdAt = toIso(r.createdAt, now);
  r.pinned = r.pinned === true;
  r.resumePrompt = String(r.resumePrompt || "").trim() || r.body;
  r.source = String(r.source || "native");
  if (r.archivedAt) r.archivedAt = toIso(r.archivedAt, now);
  if (r.deletedAt) r.deletedAt = toIso(r.deletedAt, now);
  // When two machines have both rewritten one record, the later `updatedAt` wins.
  // Records written before this field existed fall back to their creation instant,
  // which is the right answer: an untouched record loses to a touched one.
  r.updatedAt = toIso(r.updatedAt || r.deletedAt || r.archivedAt || r.createdAt, now);
  r.id = r.id ? String(r.id) : recordId(r);
  return r;
}

function toIso(v, now) {
  const d = v ? new Date(v) : now;
  return Number.isNaN(d.getTime()) ? new Date(now).toISOString() : d.toISOString();
}

// i:\x and I:/x are the same repo. Normalise separators and the drive letter so a
// record written on one casing groups with a record written on the other.
export function normalisePath(p) {
  return String(p).replace(/\\/g, "/").replace(/\/+$/, "").replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);
}

function basename(p) {
  const parts = normalisePath(p).split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

export function ageDays(record, now = new Date()) {
  return (new Date(now).getTime() - new Date(record.createdAt).getTime()) / 86400000;
}

export function isTombstone(record) {
  return record?.status === "deleted";
}

export function isStale(record, now = new Date()) {
  return !record.pinned && record.status === "waiting" && ageDays(record, now) > STALE_AFTER_DAYS;
}

/** An archived record past its window. It becomes a tombstone, not a missing file. */
export function isExpired(record, now = new Date()) {
  if (record.pinned || record.status !== "archived") return false;
  return daysSince(record.archivedAt || record.createdAt, now) > DELETE_ARCHIVED_AFTER_DAYS;
}

/** A tombstone old enough that no machine still needs telling. Now it can go. */
export function isPurgeable(record, now = new Date()) {
  if (record.pinned || record.status !== "deleted") return false;
  return daysSince(record.deletedAt || record.createdAt, now) > PURGE_TOMBSTONE_AFTER_DAYS;
}

function daysSince(iso, now) {
  return (new Date(now).getTime() - new Date(iso).getTime()) / 86400000;
}
