// Reading a handover must never take it from the window it belongs to.
//
// 2026-09-27: window A saved a handover and told the user "/clear and it loads".
// A second panel, B, was opened on the same repo; its SessionStart rightly left
// A's handover alone and listed it. B then ran load.mjs on it just to READ the
// plan for the user, and load.mjs archived it on read. A's /clear a minute later
// found nothing waiting, and the record said nothing about who had archived it.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run } from "../scripts/lib/hook.mjs";
import { saveHandover } from "../scripts/lib/store.mjs";

const LOAD = join(import.meta.dirname, "../scripts/load.mjs");

// This test process is a running window that is not the caller's: it is alive for
// as long as the child it spawns, and its pid is never the caller's CLAUDE_PID.
const OTHER_LIVE = String(process.pid);
const ME = "111";

let root, repo;
const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "ignore" });
const record = (path) => JSON.parse(readFileSync(path, "utf8"));
const fileOf = (path) => path.split(/[\\/]/).at(-1);
const consumedLines = (key) => {
  const f = join(root, key, "consumed.txt");
  return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean) : [];
};

function load(args, { owner = ME } = {}) {
  return spawnSync(process.execPath, [LOAD, ...args], {
    cwd: repo,
    env: { ...process.env, CLEAR_RESUME_HOME: root, CLAUDE_PID: owner },
    encoding: "utf8",
  });
}

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

describe("load.mjs on a handover another open window owns", () => {
  it("prints it but leaves it waiting for its own window, and says how to take it", () => {
    const { path, key } = saveHandover({ cwd: repo, title: "A's plan", body: "## Next action\nShip the grid.", root, owner: OTHER_LIVE });

    const out = load([fileOf(path)]);

    expect(out.status).toBe(0);
    expect(out.stdout).toContain("Ship the grid.");
    expect(record(path).status).toBe("waiting");
    expect(out.stdout).toMatch(/another open .*window/i);
    expect(out.stdout).toContain("--take");
    expect(consumedLines(key)).toEqual([]);
  });

  it("--take archives it here, stamps who took it, and marks it consumed", () => {
    const { path, key } = saveHandover({ cwd: repo, title: "A's plan", body: "body", root, owner: OTHER_LIVE });

    const out = load(["--take", fileOf(path)]);

    expect(out.status).toBe(0);
    expect(out.stdout).toContain("body");
    const after = record(path);
    expect(after.status).toBe("archived");
    expect(after.archivedBy).toMatchObject({ owner: ME, via: "load" });
    expect(after.archivedBy.pid).toMatch(/^\d+$/);
    expect(consumedLines(key)).toEqual([`${after.createdAt}|A's plan`]);
  });
});

describe("load.mjs --peek", () => {
  it("never archives, even this window's own handover", () => {
    const { path, key } = saveHandover({ cwd: repo, title: "mine", body: "my body", root, owner: ME });

    const out = load(["--peek", fileOf(path)]);

    expect(out.status).toBe(0);
    expect(out.stdout).toContain("my body");
    expect(record(path).status).toBe("waiting");
    expect(consumedLines(key)).toEqual([]);
  });

  it("refuses --peek and --take together, and archives nothing", () => {
    const { path } = saveHandover({ cwd: repo, title: "x", body: "y", root, owner: ME });
    const out = load(["--peek", "--take", fileOf(path)]);
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/--peek and --take/);
    expect(record(path).status).toBe("waiting");
  });
});

// A pid that was real a moment ago and has exited: a window that has closed.
function deadPid() {
  return String(spawnSync(process.execPath, ["-e", ""]).pid);
}

describe("load.mjs keeps today's behaviour where no other open window can claim it", () => {
  for (const [label, owner] of [
    ["this window's own", () => ME],
    ["a closed window's", deadPid],
    ["an unowned", () => ""],
  ]) {
    it(`archives ${label} handover, stamps it, and marks it consumed`, () => {
      const { path, key } = saveHandover({ cwd: repo, title: "resume me", body: "the body", root, owner: owner() });

      const out = load([fileOf(path)]);

      expect(out.status).toBe(0);
      expect(out.stdout).toContain("the body");
      expect(out.stdout).not.toContain("read only");
      const after = record(path);
      expect(after.status).toBe("archived");
      expect(after.archivedBy).toMatchObject({ owner: ME, via: "load" });
      expect(consumedLines(key)).toEqual([`${after.createdAt}|resume me`]);
    });
  }
});

describe("archivedBy records what archived a handover", () => {
  it("the SessionStart hook stamps via hook, with the loading window", () => {
    const { path } = saveHandover({ cwd: repo, title: "mine", body: "b", root, owner: ME });

    run({ cwd: repo }, { env: { CLEAR_RESUME_HOME: root, CLAUDE_PID: ME } });

    const after = record(path);
    expect(after.status).toBe("archived");
    expect(after.archivedBy).toEqual({ owner: ME, pid: String(process.pid), via: "hook" });
  });

  it("a re-save stamps the handover it supersedes via supersede", () => {
    const first = saveHandover({ cwd: repo, title: "one", body: "x", root, owner: ME, now: new Date("2026-09-27T00:00:00Z") });
    saveHandover({ cwd: repo, title: "two", body: "y", root, owner: ME, now: new Date("2026-09-27T00:01:00Z") });

    expect(record(first.path).status).toBe("archived");
    expect(record(first.path).archivedBy).toEqual({ owner: ME, pid: String(process.pid), via: "supersede" });
  });
});

describe("SessionStart listing", () => {
  it("steers another open window's handover to --peek and says whose it is; a closed window's keeps the plain command", () => {
    const theirs = saveHandover({ cwd: repo, title: "Their work", body: "t", root, owner: OTHER_LIVE });
    git("checkout", "-q", "-b", "side");
    const orphan = saveHandover({ cwd: repo, title: "Orphan work", body: "o", root, owner: deadPid() });
    git("checkout", "-q", "main");

    const ctx = run({ cwd: repo }, { env: { CLEAR_RESUME_HOME: root, CLAUDE_PID: ME } }).hookSpecificOutput.additionalContext;
    const rows = ctx.split("\n- ").slice(1);
    const theirRow = rows.find((r) => r.includes("Their work"));
    const orphanRow = rows.find((r) => r.includes("Orphan work"));

    expect(ctx).toContain("none loaded");
    expect(theirRow).toContain("(belongs to another open window)");
    expect(theirRow).toContain(`--peek ${fileOf(theirs.path)}`);
    expect(orphanRow).not.toContain("belongs to another open window");
    expect(orphanRow).not.toContain("--peek");
    expect(orphanRow).toContain(fileOf(orphan.path));
    expect(record(theirs.path).status).toBe("waiting");
  });
});
