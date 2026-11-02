// The move from the old product name to cornerman. Everything that knows the old store
// path or the old variable names is here, so a later release can drop it in one place.
//
// There is one store at all times, moved by an atomic rename. A copy would leave two
// live stores, and keeping those in step is how a deleted record comes back. A collision
// in this store is silent data loss, so nothing here ever deletes or rewrites an original:
// a folder that cannot be renamed into place is merged additively and kept beside it.
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const OLD_DIR = ".clear-resume";
const NEW_DIR = ".cornerman";
const OLD_HEADLESS = ".clear-resume-headless";
const NEW_HEADLESS = ".cornerman-headless";
// What a version from before the rename left in a repo, for web mode to read. Nothing writes these now.
export const LEGACY_REPO_FILE = `${OLD_DIR}/HANDOVER.md`;
export const LEGACY_REF_PREFIX = "clear-resume/";

// On Windows a git child in the store (a background sync) blocks the rename for a moment,
// so a short wait is worth it. An editor's folder watcher holds it for as long as the
// window is open: then the store stays put, in use, and the next session start tries again.
const RETRIES = 2;
const RETRY_MS = 150;
// A merge runs inside a SessionStart hook with a 20s limit. It stops here and the next
// session carries on, so a large store costs a few starts, not a killed hook.
const MERGE_MS = 4000;
// In an old folder put aside once its content has reached the store.
const MERGED = ".merged";
const CONSUMED = "consumed.txt";
const GIT_TMP = ".git.carry.tmp";

/**
 * The store folder. Worked out from the disk on every call, so all the code in one
 * process, every process and the mod agree without being told: the old folder until
 * the new one exists, and then the new one. There is never a moment when two versions
 * of the code read different stores because a move was blocked.
 */
export function resolveStore(env = process.env, home = homedir()) {
  const own = env.CORNERMAN_HOME || env.CLEAR_RESUME_HOME;
  if (own) return resolve(own);
  return pickFolder(join(home, OLD_DIR), join(home, NEW_DIR));
}

/** The default store for headless runs, by the same rule. */
export function resolveHeadlessStore(home = homedir()) {
  return pickFolder(join(home, OLD_HEADLESS), join(home, NEW_HEADLESS));
}

const pickFolder = (old, next) => (isFolder(next) || !isFolder(old) ? next : old);

function isFolder(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Give each CLEAR_RESUME_X its CORNERMAN_X, so a settings file from before the rename keeps working. A new name set by hand wins. */
export function adoptLegacyEnv(env = process.env) {
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("CLEAR_RESUME_")) continue;
    const name = `CORNERMAN_${key.slice("CLEAR_RESUME_".length)}`;
    if (env[name] === undefined) env[name] = value;
  }
}

/** Move the old store to the new path. Never throws, and never deletes anything. */
export function migrateStore({ home = homedir(), retries = RETRIES, mergeMs = MERGE_MS, oldDir = OLD_DIR, newDir = NEW_DIR } = {}) {
  try {
    return step(join(home, oldDir), join(home, newDir), home, retries, Date.now() + mergeMs);
  } catch (error) {
    return { state: "failed", reason: String(error?.code || error?.message) };
  }
}

// Which outcomes the person hears about. A move or a merge once, when it happens. A store
// that stayed put at most once a day, since every session start in that state tries again.
const NOTICES = {
  moved: () => `cornerman: your handovers moved from ~/${OLD_DIR} to ~/${NEW_DIR}. Nothing was removed.`,
  merged: () => `cornerman: handovers from ~/${OLD_DIR} were merged into ~/${NEW_DIR}. The old folder is kept beside it.`,
};
const STILL_THERE = {
  pending: () => `cornerman: your handovers stay in ~/${OLD_DIR} for now, because another program has that folder open (usually a VS Code window). They all keep working, and the move finishes once every VS Code window has been closed.`,
  held: () => `cornerman: your handovers are in ~/${NEW_DIR}, but ~/${OLD_DIR} could not be put aside because another program has it open (usually a VS Code window). Nothing is lost, and it finishes once every VS Code window has been closed.`,
  failed: (reason) => `cornerman: could not move your handovers to ~/${NEW_DIR} (${reason}). They all keep working where they are.`,
};
const NOTICE_MARK = "rename-notice";

/**
 * The move, for code starting up against the default store. Returns what to tell the
 * person, or "". A store someone pointed at a folder of their own is not ours to move.
 */
export function migrateOnStart({ env = process.env, home = homedir(), now = new Date() } = {}) {
  if (env.CORNERMAN_HOME || env.CLEAR_RESUME_HOME || env.CORNERMAN_NO_MIGRATE || process.env.CORNERMAN_NO_MIGRATE) return "";
  const { state, reason } = migrateStore({ home });
  if (NOTICES[state]) return NOTICES[state]();
  if (!STILL_THERE[state] || !firstToday(resolveStore(env, home), now)) return "";
  return STILL_THERE[state](reason);
}

// .nudged is the store's folder for marks like this one, and sync ignores it.
export function firstToday(root, now, name = NOTICE_MARK) {
  const today = now.toISOString().slice(0, 10);
  const mark = join(root, ".nudged", name);
  try {
    if (readFileSync(mark, "utf8") === today) return false;
  } catch {
    // No mark yet.
  }
  try {
    mkdirSync(join(root, ".nudged"), { recursive: true });
    writeFileSync(mark, today);
  } catch {
    // Saying it twice is better than never.
  }
  return true;
}

/** The same move for the store headless runs use, which never shares a folder with the main one. */
export const migrateHeadlessStore = (options = {}) => migrateStore({ ...options, oldDir: OLD_HEADLESS, newDir: NEW_HEADLESS });

function step(old, next, home, retries, deadline) {
  if (!finishAsides(home, basename(old), next, deadline)) return { state: "merging" };
  // The new folder first. Read the other way round, another session's rename landing
  // between the two reads looks like two real folders, and this one would merge the
  // store into itself.
  const hasNext = existsSync(next);
  // Follows a link, so a link to nothing counts as nothing there.
  if (!existsSync(old)) return { state: hasNext ? "done" : "fresh" };
  if (hasNext) return sameFolder(old, next) ? { state: "done" } : mergeFolders(old, next, home, deadline);
  for (let tries = 0; ; tries++) {
    try {
      renameSync(old, next);
      linkOldPath(old, next);
      return { state: "moved" };
    } catch (error) {
      // Another session's rename won this one. Its link is its own job.
      if (!kind(old) || existsSync(next)) return { state: "done" };
      if (tries >= retries) return { state: "pending", reason: String(error?.code || error?.message) };
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_MS);
    }
  }
}

// A folder that vanishes mid-check is another session's move landing, not a second store.
function sameFolder(a, b) {
  try {
    // Windows paths can differ by the case of the drive letter alone.
    const same = (path) => (process.platform === "win32" ? realpathSync(path).toLowerCase() : realpathSync(path));
    return same(a) === same(b);
  } catch {
    return true;
  }
}

function kind(path) {
  try {
    return lstatSync(path).isSymbolicLink() ? "link" : "folder";
  } catch {
    return null;
  }
}

/**
 * Point the old path at the store, so a window still running the old version writes
 * into it. A junction on Windows needs no admin rights; elsewhere the type is ignored.
 *
 * A failure here is left alone: if an old window then recreates the old folder as a
 * real one, migrateStore finds both folders and merges them.
 */
function linkOldPath(old, next) {
  try {
    symlinkSync(next, old, "junction");
  } catch {
    // Taken already, or not allowed on this disk.
  }
}

/** Both folders are real. Bring the old one's content over, then put it to one side. */
function mergeFolders(old, next, home, deadline) {
  if (!mergeInto(old, next, deadline)) return { state: "merging" };
  // A parallel merge finished meanwhile and left its link. Renaming that would pass a link off as a backup.
  if (kind(old) === "link" && sameFolder(old, next)) return { state: "done" };
  const aside = join(home, `${basename(old)}.aside-${Date.now()}-${process.pid}`);
  try {
    renameSync(old, aside);
  } catch (error) {
    // Held open. The store has everything so far, and this runs again next session.
    return { state: "held", reason: String(error?.code || error?.message) };
  }
  linkOldPath(old, next);
  // A last pass from where no writer can reach: whatever landed in the old folder
  // between the copy and the rename. A link's target is someone else's folder, so it
  // gets no marker, and nothing wrote to it through a path that has only just changed.
  if (kind(aside) === "folder") finishAside(aside, next, deadline);
  return { state: "merged" };
}

/** Merge an aside into the store, then mark it finished. A crash before the mark means the next run does it again. */
function finishAside(aside, next, deadline) {
  if (!mergeInto(aside, next, deadline)) return false;
  writeFileSync(join(aside, MERGED), `${new Date().toISOString()}\n`);
  return true;
}

/** Asides an interrupted run left unfinished. False when the deadline stopped it. */
function finishAsides(home, oldName, next, deadline) {
  for (const name of readdirSync(home)) {
    if (!name.startsWith(`${oldName}.aside-`)) continue;
    const aside = join(home, name);
    if (kind(aside) !== "folder" || existsSync(join(aside, MERGED))) continue;
    if (!finishAside(aside, next, deadline)) return false;
  }
  return true;
}

/** A store folder into the store. False when the deadline stopped it. */
function mergeInto(from, to, deadline) {
  const own = (name) => name === ".git" || name === MERGED;
  return copyInto(from, to, deadline, own) && carryGit(from, to, deadline);
}

// Two git histories never mix: objects from one and refs from the other is a repository
// nobody can reason about. So a history arrives whole, under a name git cannot see until
// it is complete, or not at all. The same name across runs lets a large one take a few starts.
function carryGit(from, to, deadline) {
  const src = join(from, ".git");
  const dst = join(to, ".git");
  const tmp = join(to, GIT_TMP);
  if (existsSync(dst)) {
    dropCarry(tmp);
    return true;
  }
  if (!existsSync(src)) return true;
  // A lock belongs to a git process in the old folder. Copied, it would stop every git here.
  if (copyInto(src, tmp, deadline, (name) => name.endsWith(".lock"))) {
    try {
      renameSync(tmp, dst);
      return true;
    } catch {
      // Another merge finished first, or something holds it.
    }
  }
  // Held or cut short, this aside stays unmarked and the next run tries again.
  if (!existsSync(dst)) return false;
  dropCarry(tmp);
  return true;
}

// A parallel merge may still be writing here, and whichever finishes last clears what is left.
function dropCarry(tmp) {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    // The writer still in it clears it when it finishes.
  }
}

/** False when the deadline stopped it or a file would not land. Safe to run again: what is there already is judged the same way. */
function copyInto(from, to, deadline, skip = () => false) {
  mkdirSync(to, { recursive: true });
  let whole = true;
  for (const name of readdirSync(from)) {
    if (name.endsWith(".tmp") || skip(name)) continue;
    if (Date.now() >= deadline) return false;
    const src = join(from, name);
    const dst = join(to, name);
    const stat = lstatSync(src);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      if (!copyInto(src, dst, deadline, skip)) whole = false;
    } else if (!existsSync(dst) || isLater(src, dst)) {
      if (!copyAtomic(src, dst)) whole = false;
    } else if (name === CONSUMED) joinLines(src, dst);
  }
  return whole;
}

// Each line says one handover was loaded. Losing one offers that handover again.
function joinLines(src, dst) {
  const lines = (path) => readFileSync(path, "utf8").split("\n").filter(Boolean);
  const have = new Set(lines(dst));
  const missing = lines(src).filter((line) => !have.has(line));
  if (!missing.length) return;
  const cut = !readFileSync(dst, "utf8").endsWith("\n");
  appendFileSync(dst, `${cut ? "\n" : ""}${missing.join("\n")}\n`, "utf8");
}

// A record in both folders: the later write wins, the rule sync.mjs applies to a conflict.
function isLater(src, dst) {
  if (!src.endsWith(".json")) return false;
  const from = stamp(src);
  if (from === null) return false;
  const to = stamp(dst);
  return to === null || from > to;
}

/** When a record was last written, "" if it does not say, null if it will not parse. */
function stamp(path) {
  try {
    const r = JSON.parse(readFileSync(path, "utf8"));
    return String(r.updatedAt || r.deletedAt || r.archivedAt || r.createdAt || "");
  } catch {
    return null;
  }
}

/** False when the file did not land. Whatever holds the destination may be a reader, so only the bytes can say a parallel merge won. */
function copyAtomic(src, dst) {
  const tmp = `${dst}.${process.pid}.tmp`;
  try {
    copyFileSync(src, tmp);
    renameSync(tmp, dst);
    return true;
  } catch {
    rmSync(tmp, { recursive: true, force: true });
    return sameBytes(src, dst);
  }
}

function sameBytes(a, b) {
  try {
    return readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
}
