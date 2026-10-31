// A SessionStart hook Claude Code kills at 10s must not take a handover with it.
// On 2026-10-31 20:26 the hook ran 10395 ms and was killed after run() had already
// moved the handover to loaded/, so the new session got nothing and the handover was
// gone from the waiting list (issue #162). The archive belongs after the output is
// written, like the untracked-copy delete, so a killed hook leaves it waiting.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listWaiting, repoKey, saveHandover } from "../plugin/scripts/lib/store.mjs";
import { run } from "../plugin/scripts/lib/hook.mjs";

let dir, home, repo;
const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "ignore" });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cr-order-"));
  home = join(dir, "home");
  repo = join(dir, "repo");
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const env = () => ({ ...process.env, CORNERMAN_HOME: home, CORNERMAN_SYNC: "off", CLAUDE_PID: "" });
const waiting = () => listWaiting(home, repoKey(repo)).map((h) => h.meta.title);

describe("archive waits for the output", () => {
  it("leaves the handover waiting until afterOutput runs", () => {
    saveHandover({ cwd: repo, title: "Keep me", body: "b", root: home, owner: "" });

    const out = run({ cwd: repo, source: "clear" }, { env: env() });

    expect(out.systemMessage).toMatch(/loaded handover "Keep me"/);
    // The hook is killed here, before the write: nothing may have been consumed.
    expect(waiting()).toEqual(["Keep me"]);

    out.afterOutput();
    expect(waiting()).toEqual([]);
  });
});
