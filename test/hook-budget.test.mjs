// The SessionStart hook has a 10s budget and may already spend up to 8s on the
// pull. Without CLAUDE_PID, finding this window's owner means walking the process
// table through PowerShell (measured about 2.3s, 5s timeout). The echo path - the
// twin SessionStart of one /clear - must never start that walk (review of #28).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../scripts/lib/hook.mjs";
import { ownerId } from "../scripts/lib/owner.mjs";
import { saveHandover } from "../scripts/lib/store.mjs";

vi.mock("../scripts/lib/owner.mjs", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, ownerId: vi.fn(real.ownerId) };
});

let root, repo;
const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "ignore" });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cr-store-"));
  repo = mkdtempSync(join(tmpdir(), "cr-repo-"));
  git("init", "-q", "-b", "main");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

describe("SessionStart owner lookup on the echo path", () => {
  it("re-emits and lists another window's handover without looking the owner up", () => {
    git("checkout", "-q", "-b", "side");
    saveHandover({ cwd: repo, title: "Theirs", body: "t", root, owner: String(process.pid) });
    git("checkout", "-q", "main");
    saveHandover({ cwd: repo, title: "Mine", body: "m", root, owner: "" });
    const env = { CLEAR_RESUME_HOME: root };

    run({ cwd: repo, source: "startup" }, { env });
    ownerId.mockClear();
    const twin = run({ cwd: repo, source: "clear" }, { env });

    expect(twin.systemMessage).toMatch(/loaded handover "Mine"/);
    expect(twin.hookSpecificOutput.additionalContext).toContain('"Theirs"');
    expect(ownerId).not.toHaveBeenCalled();
  });
});
