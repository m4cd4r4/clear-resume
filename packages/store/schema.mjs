// Unified handover record: ONE schema shared by the plugin (Claude Desktop / CLI)
// and the VS Code extension. A third store is the failure mode this project exists
// to avoid, so every reader and writer goes through here.
//
// Layout: <root>/handovers/<machine>-<pid>-<iso>.json
// Per-file naming by machine and pid means two machines never write the same path,
// so git sync (phase 3) cannot conflict.

export const SCHEMA_VERSION = 1;

/** @typedef {"waiting"|"archived"} HandoverStatus */

export const STATUSES = /** @type {const} */ (["waiting", "archived"]);

// Clutter control is a requirement, not a nicety. Pinned records are exempt from both.
export const STALE_AFTER_DAYS = 7;
export const DELETE_ARCHIVED_AFTER_DAYS = 30;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;

export function fileStamp(date) {
  return new Date(date).toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
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
  const m = /^(.*)-([0-9]+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)$/.exec(String(id));
  if (!m) return null;
  return { machine: m[1], pid: m[2], stamp: m[3] };
}

/**
 * Fill defaults and coerce types. Throws on the three fields a record is useless
 * without; everything else degrades to a sane default so one bad file written by an
 * older version never blanks the tree.
 */
export function normalise(input, now = new Date()) {
  const r = { ...input };
  if (!r.title || !String(r.title).trim()) throw new Error("title is required");
  if (!r.body || !String(r.body).trim()) throw new Error("body is required");
  if (!r.repoPath || !String(r.repoPath).trim()) throw new Error("repoPath is required");

  r.schema = Number(r.schema) || SCHEMA_VERSION;
  r.title = String(r.title).trim();
  r.body = String(r.body).replace(/\r\n/g, "\n").trim();
  r.repoPath = normalisePath(r.repoPath);
  r.repo = String(r.repo || basename(r.repoPath) || "unknown");
  r.branch = String(r.branch || "");
  r.machine = String(r.machine || "unknown");
  r.pid = String(r.pid ?? "0");
  r.createdAt = toIso(r.createdAt, now);
  r.status = STATUSES.includes(r.status) ? r.status : "waiting";
  r.pinned = r.pinned === true;
  r.resumePrompt = String(r.resumePrompt || "").trim() || r.body;
  r.source = String(r.source || "native");
  if (r.archivedAt) r.archivedAt = toIso(r.archivedAt, now);
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

export function isStale(record, now = new Date()) {
  return !record.pinned && record.status === "waiting" && ageDays(record, now) > STALE_AFTER_DAYS;
}

export function isExpired(record, now = new Date()) {
  if (record.pinned || record.status !== "archived") return false;
  const since = record.archivedAt || record.createdAt;
  return (new Date(now).getTime() - new Date(since).getTime()) / 86400000 > DELETE_ARCHIVED_AFTER_DAYS;
}
