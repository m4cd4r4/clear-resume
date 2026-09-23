// Where a handover is filed must be decided by the SESSION ROOT, not the cwd.
//
// The worktree fix (PR #21) covered a `cd` into another checkout of the same
// repo. This covers the other half: a `cd` into a DIFFERENT repo. The session
// resumes at its root, so that is the only place the record is any use.
//
// Claude Code exports CLAUDE_CODE_SESSION_ID, and ~/.claude/projects/<slug>/
// <id>.jsonl holds the transcript whose first row records the cwd the session
// started in. The slug itself is lossy ("i--Users-me-code-app" cannot be
// decoded back to a drive letter unambiguously), so the transcript's own cwd
// field is what gets read.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionRoot } from "../scripts/lib/session.mjs";
import { normalisePath } from "../packages/store/schema.mjs";

let home, projects;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "cr-sr-"));
  projects = join(home, ".claude", "projects", "d--code-app");
  mkdirSync(projects, { recursive: true });
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const transcript = (id, cwd) =>
  writeFileSync(join(projects, `${id}.jsonl`), `${JSON.stringify({ type: "user", cwd, sessionId: id })}\n`, "utf8");

describe("sessionRoot", () => {
  it("is the directory the session started in, whatever the cwd has become", () => {
    transcript("abc-123", "D:\\code\\app");
    const found = sessionRoot({ env: { CLAUDE_CODE_SESSION_ID: "abc-123" }, home });
    expect(found).toBe(normalisePath("D:/code/app"));
  });
});
