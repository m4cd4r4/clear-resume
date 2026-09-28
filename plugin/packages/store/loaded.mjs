// A readable copy of every handover a session loads.
//
// A loaded handover goes into Claude's context and nowhere a person can open, so
// after /clear nothing on screen says which handover this window started from.
// The loader (the SessionStart hook, or load.mjs) writes a plain markdown copy
// here and prints its path; the VS Code extension opens the same file.
//
//   <root>/loaded/<repo>-<title>-<shortid>.md
//
// The name carries no machine or user name. The record file name holds the
// hostname, so the short id stands in for it; and the repo folder of a session
// started in the home folder IS the user name, so that one is called "home".
//
// The folder is machine-local. It ignores itself, so a synced store never
// commits these copies: they repeat what the records already hold, and the path
// printed for one is a path on this machine.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DELETE_ARCHIVED_AFTER_DAYS, normalisePath } from "./schema.mjs";

/** Seven hex characters that stand for a record id; load.mjs accepts them. */
export function shortId(id) {
  return createHash("sha1").update(String(id)).digest("hex").slice(0, 7);
}

export function loadedDir(root) {
  return join(root, "loaded");
}

const slug = (s, max) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, max)
    .replace(/-+$/, "");

const fold = (s) => (process.platform === "win32" || process.platform === "darwin" ? s.toLowerCase() : s);

/**
 * The long form of a path: links and junctions followed, and a Windows 8.3 name
 * (C:\Users\JOHNSM~1\...) expanded. The nearest part that exists is resolved, so a
 * path not yet written resolves too. Never throws.
 */
export function longForm(p) {
  const tail = [];
  let head = String(p);
  for (let i = 0; i < 64; i++) {
    try {
      return [realpathSync.native(head), ...tail.reverse()].join("/");
    } catch {
      const up = dirname(head);
      if (up === head) return String(p);
      tail.push(basename(head));
      head = up;
    }
  }
  return String(p);
}

// Whether two spellings name the same folder: as written, or once resolved. A
// session outside git records its cwd as given, which on POSIX is the physical
// path, while homedir() is $HOME unresolved; through a link or an 8.3 name the
// strings differ and the user name reached the copy's name (2026-09-28).
const sameFolder = (a, b) =>
  fold(normalisePath(a)) === fold(normalisePath(b)) || fold(normalisePath(longForm(a))) === fold(normalisePath(longForm(b)));

// The repo's folder name, or "home" for a session started in the home folder.
function repoName(repoPath, home) {
  const p = normalisePath(repoPath || "");
  if (!p) return "";
  if (home && sameFolder(p, home)) return "home";
  return p.split("/").filter(Boolean).at(-1) ?? "";
}

/** The copy's file name: `<repo>-<title>-<shortid>.md`, lower case, no machine or user name. */
export function loadedCopyName(record, { home = homedir() } = {}) {
  const repo = slug(repoName(record.repoPath, home), 40) || "repo";
  const title = slug(record.title, 60) || "handover";
  return `${repo}-${title}-${shortId(record.id)}.md`;
}

export function loadedCopyPath(root, record, opts) {
  return join(loadedDir(root), loadedCopyName(record, opts));
}

// Local time with its offset: a person reads this file, and a bare UTC stamp
// makes them do the sum.
function stamp(when) {
  const t = new Date(when);
  if (Number.isNaN(t.getTime())) return "unknown";
  const p = (n) => String(n).padStart(2, "0");
  const off = -t.getTimezoneOffset();
  const abs = Math.abs(off);
  const zone = `UTC${off < 0 ? "-" : "+"}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())} (${zone})`;
}

const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * The copy's text: title, repo, branch, when it was saved and loaded, then the
 * body. A body that opens with the same title as a heading (the handover skill
 * writes one) loses that line, so the title is not printed twice.
 */
export function loadedCopyText(record, { loadedAt = new Date(), home = homedir() } = {}) {
  const title = oneLine(record.title) || "Untitled handover";
  const repo = repoName(record.repoPath, home);
  let body = String(record.body ?? "").replace(/\r\n/g, "\n").trim();
  const [first, ...rest] = body.split("\n");
  if (/^#\s/.test(first) && oneLine(first.replace(/^#\s+/, "")) === title) body = rest.join("\n").trim();
  const facts = [
    `- Repo: ${repo === "home" ? "home folder" : oneLine(repo) || "unknown"}`,
    record.branch ? `- Branch: ${oneLine(record.branch)}` : "",
    `- Saved: ${stamp(record.createdAt)}`,
    `- Loaded: ${stamp(loadedAt)}`,
  ].filter(Boolean);
  return `# ${title}\n\n${facts.join("\n")}\n\n---\n\n${body}\n`;
}

/**
 * Write the readable copy of a loaded handover and return its path, or null.
 *
 * Never throws. A copy is a convenience and a load is the point: a full disk, a
 * read-only folder or a file where the folder should be skips the copy, and the
 * handover still loads.
 */
export function writeLoadedCopy(root, record, { loadedAt = new Date(), home = homedir() } = {}) {
  try {
    const dir = loadedDir(root);
    mkdirSync(dir, { recursive: true });
    const ignore = join(dir, ".gitignore");
    if (!existsSync(ignore)) writeFileSync(ignore, "*\n", "utf8");
    const path = join(dir, loadedCopyName(record, { home }));
    writeFileSync(path, loadedCopyText(record, { loadedAt, home }), "utf8");
    try {
      // The file's own date is the load, which is what the prune measures.
      const at = new Date(loadedAt);
      if (!Number.isNaN(at.getTime())) utimesSync(path, at, at);
    } catch {
      // A copy dated now is pruned a little late. Harmless.
    }
    return path;
  } catch {
    return null;
  }
}

/**
 * Delete copies older than the archived-record window, so the folder never grows
 * without limit. Measured from the file's date, which is when it was loaded.
 * Returns the file names it removed. Never throws.
 */
export function pruneLoaded({ root, now = new Date() } = {}) {
  const dir = loadedDir(root);
  const gone = [];
  let files = [];
  try {
    if (!existsSync(dir)) return gone;
    files = readdirSync(dir);
  } catch {
    return gone;
  }
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const path = join(dir, file);
    try {
      if ((new Date(now).getTime() - statSync(path).mtimeMs) / 86_400_000 > DELETE_ARCHIVED_AFTER_DAYS) {
        rmSync(path, { force: true });
        gone.push(file);
      }
    } catch {
      // One unreadable file must not stop the rest.
    }
  }
  return gone;
}
