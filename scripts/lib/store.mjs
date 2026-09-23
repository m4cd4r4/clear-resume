// Handover store for the plugin's hooks and CLI.
//
// Storage itself lives in packages/store - one JSON record per handover under
// <root>/handovers - so the VS Code extension and these hooks read and write the
// same thing. Anything written here shows up in the extension's tree, and a
// handover the extension archives stops being offered here.
//
// The functions below keep the shapes the hooks already pass around
// ({ meta, body, path, file }, and a repo key), because web.mjs works on
// handovers carried in git that never reach the store at all.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { basename, resolve } from "node:path";
import {
  archiveRecord,
  listAll,
  save,
  storeRoot as sharedStoreRoot,
} from "../../packages/store/store.mjs";
import { normalisePath } from "../../packages/store/schema.mjs";
import { mainWorktree, worktreePaths } from "../../packages/store/worktree.mjs";
import { isSynced, pushInBackground } from "../../packages/store/sync.mjs";

export function storeRoot(env = process.env) {
  return sharedStoreRoot(env);
}

function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

// Repo top level (or cwd outside git) and current branch ("" outside git,
// "detached@<sha>" on a detached HEAD).
export function repoInfo(cwd) {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]) || resolve(cwd);
  let branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch === "HEAD") branch = `detached@${git(cwd, ["rev-parse", "--short", "HEAD"])}`;
  return { top, branch };
}

// Readable and collision-free: folder name plus a hash of the full path, so two
// checkouts called "app" in different places never share a key. Windows drive
// letters and separators are normalised so i:\x and I:/x hash the same.
//
// Records are keyed by repoPath now, not by this. It survives because web.mjs
// files its "already loaded" marks per repo key, and those marks are about
// handovers carried in git, which have no record.
export function repoKey(top) {
  const norm = normalisePath(top);
  const hash = createHash("sha1").update(norm).digest("hex").slice(0, 8);
  return `${slugify(basename(norm)) || "root"}-${hash}`;
}

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

// Minimal frontmatter parser, kept for handovers carried in git (web.mjs): those
// are markdown files in a worktree, not records, so they still arrive as text.
export function parseHandover(text) {
  const m = /^---\n([\s\S]*?)\n---\n\n?/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(": ");
    if (i < 1) continue;
    try {
      meta[line.slice(0, i)] = JSON.parse(line.slice(i + 2));
    } catch {
      meta[line.slice(0, i)] = line.slice(i + 2);
    }
  }
  return { meta, body: text.replace(/\r\n/g, "\n").slice(m[0].length) };
}

// Minimal frontmatter: one `key: "json string"` per line. Values are JSON-quoted
// so a title with a colon or quote round-trips.
function frontmatter(meta) {
  const lines = Object.entries(meta).map(([k, v]) => `${k}: ${JSON.stringify(String(v))}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

/**
 * Render a stored record as the markdown the web fallback carries in git.
 *
 * The store is JSON, but what travels in a repo stays markdown with frontmatter:
 * it shows up readable in a diff, and a session on an older version can still
 * parse it.
 */
export function handoverMarkdown(pathOrRecord) {
  const record =
    typeof pathOrRecord === "string" ? JSON.parse(readFileSync(pathOrRecord, "utf8")) : pathOrRecord;
  const meta = { title: record.title, created: record.createdAt, repo: record.repoPath, branch: record.branch };
  return frontmatter(meta) + String(record.body).trim() + "\n";
}

/** Present a record the way the hooks and web.mjs expect a handover to look. */
function asHandover(record) {
  return {
    path: record.path,
    file: basename(record.path),
    id: record.id,
    meta: { title: record.title, created: record.createdAt, repo: record.repoPath, branch: record.branch },
    body: record.body,
  };
}

/**
 * Waiting handovers for one repo, oldest first.
 *
 * `repoOrKey` accepts a repo path or a repo key: the hooks hold a path, and a
 * caller that only has the key still gets the right rows.
 */
export function listWaiting(root = storeRoot(), repoOrKey = "") {
  const want = String(repoOrKey);
  const byKey = /-[0-9a-f]{8}$/.test(want) && !want.includes("/") && !want.includes("\\");
  // A path match covers every checkout of the same repo, not just the one the
  // caller is standing in. A handover written in a worktree - which is where
  // most of this repo's work happens - was otherwise invisible to a session
  // that resumed in the parent checkout, and that is silent: the session starts
  // with no handover and nothing says one exists. Both sides of the comparison
  // are widened, so a record filed against a worktree that has since been
  // removed is still found through its mainPath.
  const here = byKey ? [] : new Set(worktreePaths(want).map(normalisePath));
  const match = byKey
    ? (r) => repoKey(r.repoPath) === want
    : (r) => here.has(normalisePath(r.repoPath)) || here.has(normalisePath(r.mainPath || r.repoPath));

  return listAll(root)
    .filter((r) => r.status === "waiting" && (!want || match(r)))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map(asHandover);
}

/**
 * Mark a handover loaded. The record stays where it is and flips to archived, so
 * nothing is renamed across directories and the extension keeps its history.
 * `key` is ignored; it is still accepted because the hooks pass it.
 */
export function archive(root, key, path) {
  const record = listAll(root).find((r) => r.path === path || r.id === path);
  if (!record) return path;
  archiveRecord(record.id, { root });
  return record.path;
}

// Save a handover. A newer save on the same branch supersedes the waiting one,
// so re-running /handover never leaves two competing copies; other branches
// (another window on the same repo) are left alone.
export function saveHandover({ cwd, title, body, now = new Date(), root = storeRoot() }) {
  if (!title || !String(title).trim()) throw new Error("title is required");
  if (!body || !String(body).trim()) throw new Error("handover body is empty");
  const { top, branch } = repoInfo(cwd);
  const main = mainWorktree(top);

  const superseded = listWaiting(root, top)
    .filter((h) => (h.meta.branch ?? "") === branch)
    .map((h) => archive(root, null, h.path));

  const record = save(
    {
      title: String(title).trim(),
      body: String(body).trim(),
      // What gets pre-filled when the handover is resumed from the extension.
      resumePrompt: `Resume from handover "${String(title).trim()}":\n\n${String(body).trim()}`,
      repo: basename(normalisePath(top)),
      repoPath: top,
      mainPath: main,
      branch,
      machine: hostname(),
      pid: process.pid,
      createdAt: new Date(now).toISOString(),
      status: "waiting",
      source: "plugin",
    },
    { root },
  );

  // Send it to the other machine without waiting. Writing a handover is the end of
  // a piece of work and must not sit on a slow push.
  if (isSynced(root)) pushInBackground(root);

  return { path: record.path, id: record.id, key: repoKey(top), top, main, superseded };
}
