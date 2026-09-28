// Where the session STARTED, which is where it will resume.
//
// A handover is filed against a repo so the next session in that repo loads it.
// Deriving that repo from process.cwd() is wrong: a Bash `cd` moves the cwd for
// the rest of the session while the session root stays put, so a handover
// written after a `cd` is filed somewhere the next session never looks. That
// cost a real session on 2026-09-23 - the record existed, was never offered,
// and nothing anywhere said so.
//
// Claude Code exports CLAUDE_CODE_SESSION_ID. The transcript lives at
// ~/.claude/projects/<slug>/<id>.jsonl and its first row records the cwd the
// session started in. The slug is NOT used to recover the path: it is lossy
// ("i--Users-me-code-app" has no unambiguous decoding back to a drive letter).
// The transcript's own cwd field is exact, so that is what is read.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { openSync, readSync, closeSync } from "node:fs";
import { normalisePath } from "../../packages/store/schema.mjs";

// The first row is all that is needed, and a transcript can be hundreds of MB.
const HEAD_BYTES = 64 * 1024;

function firstCwd(file) {
  let fd;
  try {
    fd = openSync(file, "r");
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = readSync(fd, buf, 0, HEAD_BYTES, 0);
    for (const line of buf.subarray(0, n).toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (row.cwd) return normalisePath(row.cwd);
      } catch {
        // A line cut in half by the head read, or a row that is not JSON.
        // Keep going: the next whole line may still carry the cwd.
      }
    }
  } catch {
    // No transcript, or no permission. The caller falls back to the cwd.
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return "";
}

/**
 * Absolute path the current session started in, or "" when it cannot be told.
 *
 * Never throws: a handover must still be written when this cannot be resolved.
 * The caller falls back to process.cwd() and says which it used, because a
 * handover filed in the wrong place must be visible rather than silent.
 */
export function sessionRoot({ env = process.env, home = homedir() } = {}) {
  const id = String(env.CLAUDE_CODE_SESSION_ID ?? "").trim();
  if (!id) return "";
  const projects = join(home, ".claude", "projects");
  if (!existsSync(projects)) return "";
  try {
    for (const dir of readdirSync(projects)) {
      const file = join(projects, dir, `${id}.jsonl`);
      if (existsSync(file)) return firstCwd(file);
    }
  } catch {
    // Unreadable projects folder. Not fatal.
  }
  return "";
}
