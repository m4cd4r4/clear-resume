// Handover store. Everything lives under one local folder (default ~/.clear-resume),
// one subfolder per repo:
//   <root>/<repo-key>/waiting/<timestamp>-<slug>.md   handovers not yet loaded
//   <root>/<repo-key>/archive/...                     loaded or superseded
// Filenames start with a UTC timestamp, so a plain sort is chronological.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export function storeRoot(env = process.env) {
  return env.CLEAR_RESUME_HOME ? resolve(env.CLEAR_RESUME_HOME) : join(homedir(), ".clear-resume");
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
// checkouts called "app" in different places never share a store. Windows drive
// letters and separators are normalised so i:\x and I:/x hash the same.
export function repoKey(top) {
  const norm = resolve(top).replace(/\\/g, "/").replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);
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

function stamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

function dirs(root, key) {
  const base = join(root, key);
  return { waiting: join(base, "waiting"), archive: join(base, "archive") };
}

// Minimal frontmatter: one `key: "json string"` per line. Values are JSON-quoted
// so a title with a colon or quote round-trips.
function frontmatter(meta) {
  const lines = Object.entries(meta).map(([k, v]) => `${k}: ${JSON.stringify(String(v))}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

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

export function listWaiting(root, key) {
  const { waiting } = dirs(root, key);
  if (!existsSync(waiting)) return [];
  return readdirSync(waiting)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const path = join(waiting, f);
      return { path, file: f, ...parseHandover(readFileSync(path, "utf8")) };
    });
}

export function archive(root, key, path) {
  const { archive: dir } = dirs(root, key);
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, basename(path));
  renameSync(path, dest);
  return dest;
}

// Save a handover. A newer save on the same branch supersedes the waiting one,
// so re-running /handover never leaves two competing copies; other branches
// (another window on the same repo) are left alone.
export function saveHandover({ cwd, title, body, now = new Date(), root = storeRoot() }) {
  if (!title || !String(title).trim()) throw new Error("title is required");
  if (!body || !String(body).trim()) throw new Error("handover body is empty");
  const { top, branch } = repoInfo(cwd);
  const key = repoKey(top);
  const superseded = listWaiting(root, key)
    .filter((h) => (h.meta.branch ?? "") === branch)
    .map((h) => archive(root, key, h.path));

  const { waiting } = dirs(root, key);
  mkdirSync(waiting, { recursive: true });
  let path = join(waiting, `${stamp(now)}-${slugify(title) || "handover"}.md`);
  for (let n = 2; existsSync(path); n++) path = path.replace(/(-\d+)?\.md$/, `-${n}.md`);

  const meta = { title: String(title).trim(), created: now.toISOString(), repo: top, branch };
  writeFileSync(path, frontmatter(meta) + String(body).trim() + "\n", "utf8");
  return { path, key, superseded };
}
