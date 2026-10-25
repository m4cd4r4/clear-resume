// What a session left on screen: its tables, lists, links, paths and last reply.
//
// A handover is a summary the model writes, so it drops whatever the model did not
// think to keep, and a list of jobs read a moment before /clear is gone. The
// SessionEnd hook pulls these out of the transcript mechanically and writes them
// here, one folder per session:
//
//   <root>/artifacts/<sessionId>/meta.json         counts and every item, for the sidebar
//   <root>/artifacts/<sessionId>/artifacts.md      the same, readable and @-mentionable
//   <root>/artifacts/<sessionId>/last-screen.md    the last assistant replies, verbatim
//
// A handover records the id of the session that saved it, so a row finds its folder
// by that id. The folder is machine-local and ignores itself, like the loaded copies.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DELETE_ARCHIVED_AFTER_DAYS } from "./schema.mjs";

export const KINDS = ["table", "list", "link", "path"];
const LABELS = { table: ["table", "tables"], list: ["list", "lists"], link: ["link", "links"], path: ["path", "paths"] };

/** A session id is a uuid; anything else could climb out of the folder. */
export const validSessionId = (id) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(String(id ?? ""));

export function artifactsDir(root) {
  return join(root, "artifacts");
}

export function captureDir(root, sessionId) {
  return join(artifactsDir(root), String(sessionId));
}

const plural = (n, kind) => `${n} ${LABELS[kind][n === 1 ? 0 : 1]}`;

/** "2 tables, 12 links": the kinds a capture holds, most useful first. Empty when it holds nothing. */
export function summary(counts) {
  return KINDS.filter((k) => counts?.[k] > 0)
    .map((k) => plural(counts[k], k))
    .join(", ");
}

export function countItems(items) {
  const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const it of items) if (it.kind in counts) counts[it.kind]++;
  return counts;
}

const fence = (text) => {
  const longest = Math.max(2, ...(String(text).match(/`+/g) ?? []).map((s) => s.length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}\n${text}\n${ticks}`;
};

/** artifacts.md: a heading per kind, each item with how far back it was said. */
export function artifactsMarkdown(capture) {
  const out = [`# What the session left on screen`, "", `- Session: ${capture.sessionId}`, `- Captured: ${capture.capturedAt}`];
  if (capture.repoPath) out.push(`- Repo: ${capture.repoPath}`);
  out.push("", "\"back\" counts assistant replies from the end: 1 is the last thing said before the clear.", "");
  for (const kind of KINDS) {
    const items = capture.items.filter((i) => i.kind === kind);
    if (!items.length) continue;
    out.push(`## ${LABELS[kind][1][0].toUpperCase()}${LABELS[kind][1].slice(1)} (${items.length})`, "");
    for (const it of items) {
      if (kind === "link" || kind === "path") out.push(`- ${it.text} (back ${it.back})`);
      else out.push(`### ${it.title} (back ${it.back})`, "", it.text, "");
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/**
 * Write a capture and return its folder, or null. Never throws: a capture is a
 * convenience, and the clear it runs beside must go ahead.
 *
 * capture: { sessionId, repoPath, capturedAt, items: [{ kind, title, text, back }], lastScreen }
 */
export function writeCapture(root, capture) {
  try {
    if (!validSessionId(capture.sessionId)) return null;
    const dir = captureDir(root, capture.sessionId);
    mkdirSync(dir, { recursive: true });
    const ignore = join(artifactsDir(root), ".gitignore");
    if (!existsSync(ignore)) writeFileSync(ignore, "*\n", "utf8");
    const meta = {
      sessionId: capture.sessionId,
      repoPath: capture.repoPath ?? "",
      capturedAt: capture.capturedAt,
      counts: countItems(capture.items),
      items: capture.items,
      hasLastScreen: Boolean(capture.lastScreen),
    };
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta), "utf8");
    writeFileSync(join(dir, "artifacts.md"), artifactsMarkdown(capture), "utf8");
    if (capture.lastScreen) writeFileSync(join(dir, "last-screen.md"), capture.lastScreen, "utf8");
    return dir;
  } catch {
    return null;
  }
}

/** One capture's meta, or null when there is none or it cannot be read. */
export function readCapture(root, sessionId) {
  if (!validSessionId(sessionId)) return null;
  try {
    const meta = JSON.parse(readFileSync(join(captureDir(root, sessionId), "meta.json"), "utf8"));
    return meta && Array.isArray(meta.items) && validSessionId(meta.sessionId) ? meta : null;
  } catch {
    return null;
  }
}

/** Every capture, newest first. */
export function listCaptures(root) {
  const dir = artifactsDir(root);
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .map((n) => readCapture(root, n))
    .filter(Boolean)
    .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
}

/**
 * Delete captures older than the archived-record window. Measured from capturedAt, and
 * a capture still named by a waiting handover is kept (`keep` holds those session ids).
 * Returns the session ids it removed. Never throws.
 */
export function pruneCaptures({ root, now = new Date(), keep = new Set() } = {}) {
  const gone = [];
  for (const meta of listCaptures(root)) {
    const days = (new Date(now).getTime() - new Date(meta.capturedAt).getTime()) / 86_400_000;
    if (days <= DELETE_ARCHIVED_AFTER_DAYS || keep.has(meta.sessionId)) continue;
    try {
      rmSync(captureDir(root, meta.sessionId), { recursive: true, force: true });
      gone.push(meta.sessionId);
    } catch {
      // One undeletable folder must not stop the rest.
    }
  }
  return gone;
}
