// Reading a handover must never take it from the window it belongs to.
//
// 2026-09-27: window A saved a handover and told the user "/clear and it loads".
// A second panel, B, was opened on the same repo; its SessionStart rightly left
// A's handover alone and listed it. B then ran load.mjs on it just to READ the
// plan for the user, and load.mjs archived it on read. A's /clear a minute later
// found nothing waiting, and the record said nothing about who had archived it.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../scripts/lib/hook.mjs";
import { saveHandover } from "../scripts/lib/store.mjs";
import { ownerId, startFromEpochMs, startHookClock } from "../scripts/lib/owner.mjs";

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
    expect(out.stdout).toMatch(/--take [0-9a-f]{7}/);
    expect(out.stdout).not.toContain(fileOf(path));
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

describe("load.mjs on a pid that a closed window left behind", { timeout: 30_000 }, () => {
  // Windows hands a closed window's pid to the next process. A live pid that is
  // no longer a Claude process is a closed window, so its handover is claimable.
  it("archives a handover whose owner pid now belongs to a non-Claude process", () => {
    const squatter = spawn("git", ["cat-file", "--batch"], { stdio: ["pipe", "ignore", "ignore"] });
    try {
      const { path } = saveHandover({ cwd: repo, title: "orphaned", body: "o", root, owner: String(squatter.pid) });
      const out = spawnSync(process.execPath, [LOAD, fileOf(path)], {
        cwd: repo,
        env: { ...process.env, CLEAR_RESUME_HOME: root, CLAUDE_PID: ME, CLEAR_RESUME_NO_PROCESS_WALK: "" },
        encoding: "utf8",
      });
      expect(out.status).toBe(0);
      expect(out.stdout).not.toContain("read only");
      expect(record(path).status).toBe("archived");
    } finally {
      squatter.kill();
    }
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

  // A typo used to fall through to a plain, consuming load.
  it("rejects an unknown flag such as --peak, and archives nothing", () => {
    const { path } = saveHandover({ cwd: repo, title: "x", body: "y", root, owner: ME });
    const out = load(["--peak", fileOf(path)]);
    expect(out.status).toBe(1);
    expect(out.stderr).toContain("--peak");
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
    const began = Date.now() - 4000;
    const owner = `${ME}@${startFromEpochMs(began)}`;
    const first = saveHandover({ cwd: repo, title: "one", body: "x", root, owner, now: new Date(began + 1000) });
    saveHandover({ cwd: repo, title: "two", body: "y", root, owner, now: new Date(began + 2000) });

    expect(record(first.path).status).toBe("archived");
    expect(record(first.path).archivedBy).toEqual({ owner, pid: String(process.pid), via: "supersede" });
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
    expect(theirRow).toContain(`--peek ${theirs.short}`);
    expect(orphanRow).not.toContain("belongs to another open window");
    expect(orphanRow).not.toContain("--peek");
    expect(orphanRow).toContain(orphan.short);
    expect(record(theirs.path).status).toBe("waiting");
  });

  // With no CLAUDE_PID and no walk, this window cannot tell its own handover from
  // another's. Calling it another window's then steers the user to peek at their
  // own work and resume it by hand, twice.
  it("labels nothing as another window's when this window's owner is unknown", () => {
    const h = saveHandover({ cwd: repo, title: "Maybe mine", body: "m", root, owner: OTHER_LIVE });

    const ctx = run({ cwd: repo }, { env: { CLEAR_RESUME_HOME: root, CLAUDE_PID: "" } }).hookSpecificOutput.additionalContext;

    expect(ctx).toContain("Maybe mine");
    expect(ctx).not.toContain("belongs to another open window");
    expect(ctx).not.toContain("--peek");
    expect(ctx).toContain(h.short);
  });
});

// The twin check re-emits whatever was consumed in the last 15s. Once load.mjs
// started writing the consume mark, a take in one window made the next /clear in
// another re-emit that handover and skip loading its own (review of #28).
describe("the twin check only echoes a SessionStart load from this window", () => {
  const A = "333";

  it("a --take in window B does not stop window A's /clear loading A's own handover", () => {
    git("checkout", "-q", "-b", "side");
    const taken = saveHandover({ cwd: repo, title: "Taken by B", body: "B body", root, owner: OTHER_LIVE });
    git("checkout", "-q", "main");
    saveHandover({ cwd: repo, title: "A's own", body: "A body", root, owner: A });

    expect(load(["--take", fileOf(taken.path)], { owner: ME }).status).toBe(0);
    const out = run({ cwd: repo, source: "clear" }, { env: { CLEAR_RESUME_HOME: root, CLAUDE_PID: A } });

    expect(out.systemMessage).toMatch(/loaded handover "A's own"/);
    expect(out.hookSpecificOutput.additionalContext).toContain("A body");
    expect(out.hookSpecificOutput.additionalContext).not.toContain("B body");
  });

  // B's handover is on another branch, so it loads only as B's own, which takes
  // B's real start time: two live processes stand in for the windows.
  it("a SessionStart load in window B is not echoed into window A's /clear", { timeout: 30_000 }, () => {
    vi.stubEnv("CLEAR_RESUME_NO_PROCESS_WALK", "");
    const windowB = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
    try {
      const [pidA, pidB] = [String(process.pid), String(windowB.pid)];
      startHookClock();
      const [ownerA, ownerB] = [ownerId({ CLAUDE_PID: pidA }), ownerId({ CLAUDE_PID: pidB })];
      expect(ownerB).toMatch(/@/);
      git("checkout", "-q", "-b", "side");
      saveHandover({ cwd: repo, title: "B's own", body: "B body", root, owner: ownerB });
      git("checkout", "-q", "main");
      saveHandover({ cwd: repo, title: "A's own", body: "A body", root, owner: ownerA });

      startHookClock();
      const inB = run({ cwd: repo, source: "clear" }, { env: { CLEAR_RESUME_HOME: root, CLAUDE_PID: pidB } });
      expect(inB.systemMessage).toMatch(/loaded handover "B's own"/);
      startHookClock();
      const inA = run({ cwd: repo, source: "clear" }, { env: { CLEAR_RESUME_HOME: root, CLAUDE_PID: pidA } });

      expect(inA.systemMessage).toMatch(/loaded handover "A's own"/);
      expect(inA.hookSpecificOutput.additionalContext).not.toContain("B body");
    } finally {
      windowB.kill();
      vi.unstubAllEnvs();
    }
  });
});

// The hook judged "another open window" against the test process's env instead of
// the env it was run with, so on macOS, where a low pid such as 333 is often a real
// process, window A's own handover was listed instead of loaded (CI, #34).
describe("SessionStart judges owners against the env it runs with", () => {
  it("loads this window's own bare handover on the branch, its CLAUDE_PID being a live process", () => {
    const pid = String(process.pid); // alive on every platform, unlike a made-up pid
    saveHandover({ cwd: repo, title: "A's own", body: "A body", root, owner: pid });
    const out = run({ cwd: repo, source: "clear" }, { env: { CLEAR_RESUME_HOME: root, CLAUDE_PID: pid } });
    expect(out.systemMessage).toMatch(/loaded handover "A's own"/);
  });
});

// XP-2: the SessionStart hook judged an owner by `kill(pid, 0)` alone. A user who
// quits Claude instead of running /clear comes back to a handover whose pid some
// other process now holds; the hook called it "another open window's" and offered
// it only with --peek, which never archives, so it came back at every start.
describe("SessionStart on a pid a closed window left behind", { timeout: 30_000 }, () => {
  afterEach(() => vi.unstubAllEnvs());

  it("loads a handover whose owner pid now belongs to a non-Claude process", () => {
    vi.stubEnv("CLEAR_RESUME_NO_PROCESS_WALK", "");
    startHookClock(); // the hook runs in this long-lived process; give it a fresh budget
    const squatter = spawn("git", ["cat-file", "--batch"], { stdio: ["pipe", "ignore", "ignore"] });
    try {
      const { path } = saveHandover({ cwd: repo, title: "Yesterday's work", body: "y", root, owner: String(squatter.pid) });

      const out = run({ cwd: repo }, { env: { CLEAR_RESUME_HOME: root, CLAUDE_PID: ME } });

      expect(out.systemMessage).toMatch(/loaded handover "Yesterday's work"/);
      expect(out.hookSpecificOutput.additionalContext).not.toContain("belongs to another open window");
      expect(record(path).status).toBe("archived");
    } finally {
      squatter.kill();
    }
  });
});

// XP-3: the macOS and Linux native install runs a binary named after its version
// (~/.local/share/claude/versions/2.1.232). load.mjs judged the pid by name alone,
// called that open window closed, and took its handover - the bug #28 fixed.
describe("load.mjs on a window run by a binary named after its version", { timeout: 30_000 }, () => {
  let home, window;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "cr-native-"));
    const dir = join(home, ".local", "share", "claude", "versions");
    mkdirSync(dir, { recursive: true });
    const bin = join(dir, process.platform === "win32" ? "2.1.232.exe" : "2.1.232");
    copyFileSync(process.execPath, bin);
    window = spawn(bin, ["-e", "setInterval(() => {}, 1e6)"], { stdio: "ignore" });
  });
  // The binary stays locked on Windows until its process has gone.
  afterEach(async () => {
    const gone = new Promise((done) => (window.exitCode !== null || window.signalCode !== null ? done() : window.once("exit", done)));
    window.kill();
    await gone;
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it("leaves its handover waiting (owner written as a bare pid)", () => {
    const { path } = saveHandover({ cwd: repo, title: "open window", body: "o", root, owner: String(window.pid) });
    const out = spawnSync(process.execPath, [LOAD, fileOf(path)], {
      cwd: repo,
      env: { ...process.env, CLEAR_RESUME_HOME: root, CLAUDE_PID: ME, CLEAR_RESUME_NO_PROCESS_WALK: "" },
      encoding: "utf8",
    });
    expect(out.stdout).toContain("read only");
    expect(record(path).status).toBe("waiting");
  });

  it("leaves its handover waiting (owner written with its start time)", () => {
    vi.stubEnv("CLEAR_RESUME_NO_PROCESS_WALK", "");
    const owner = ownerId({ CLAUDE_PID: String(window.pid) }, { timeout: 20_000 });
    vi.unstubAllEnvs();
    expect(owner).toMatch(/@/);
    const { path } = saveHandover({ cwd: repo, title: "open window", body: "o", root, owner });
    const out = spawnSync(process.execPath, [LOAD, fileOf(path)], {
      cwd: repo,
      env: { ...process.env, CLEAR_RESUME_HOME: root, CLAUDE_PID: ME, CLEAR_RESUME_NO_PROCESS_WALK: "" },
      encoding: "utf8",
    });
    expect(out.stdout).toContain("read only");
    expect(record(path).status).toBe("waiting");
  });
});

// A pid reused by another Claude-shaped process (here node, this test runner):
// the name says Claude, the start time says it is not the window that wrote it.
describe("load.mjs on a pid a later Claude-shaped process now holds", { timeout: 30_000 }, () => {
  it("archives the handover: its window has closed", () => {
    const { path } = saveHandover({ cwd: repo, title: "old window", body: "o", root, owner: `${OTHER_LIVE}@1000` });
    const out = spawnSync(process.execPath, [LOAD, fileOf(path)], {
      cwd: repo,
      env: { ...process.env, CLEAR_RESUME_HOME: root, CLAUDE_PID: ME, CLEAR_RESUME_NO_PROCESS_WALK: "" },
      encoding: "utf8",
    });
    expect(out.stdout).not.toContain("read only");
    expect(record(path).status).toBe("archived");
  });
});

// On windows-latest the process lookup took over 5s, and a lookup that fails must
// never be read as "that window has closed": taking an open window's handover is
// the one mistake this cannot make. /proc is read directly on Linux, with no
// process to time out.
describe.skipIf(process.platform === "linux")("load.mjs when the process lookup times out", { timeout: 30_000 }, () => {
  it("leaves a live owner's handover waiting rather than guess the window closed", () => {
    const squatter = spawn("git", ["cat-file", "--batch"], { stdio: ["pipe", "ignore", "ignore"] });
    try {
      const { path } = saveHandover({ cwd: repo, title: "unknown", body: "u", root, owner: String(squatter.pid) });
      const out = spawnSync(process.execPath, [LOAD, fileOf(path)], {
        cwd: repo,
        env: { ...process.env, CLEAR_RESUME_HOME: root, CLAUDE_PID: ME, CLEAR_RESUME_NO_PROCESS_WALK: "", CLEAR_RESUME_PROCESS_TIMEOUT_MS: "1" },
        encoding: "utf8",
      });
      expect(out.stdout).toContain("read only");
      expect(record(path).status).toBe("waiting");
    } finally {
      squatter.kill();
    }
  });
});

// XP-5: the listing printed record file names, <hostname>-<pid>-<time>.json, and
// the read-only hint the absolute script path. Both carry the owner's name.
describe("load.mjs names a handover by a short id", () => {
  it("lists title and short id without the machine name, and loads by that id", () => {
    const { path } = saveHandover({ cwd: repo, title: "Listed work", body: "listed body", root, owner: ME });

    const listing = load([]);
    const short = /^([0-9a-f]{7}) {2}"Listed work"/m.exec(listing.stdout)?.[1];
    expect(short).toBeTruthy();
    expect(listing.stdout).not.toContain(fileOf(path));

    const out = load([short]);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain("listed body");
    expect(record(path).status).toBe("archived");
  });
});

describe("load.mjs by title", () => {
  it("loads a handover by its exact title, and refuses a title two handovers share", () => {
    git("checkout", "-q", "-b", "side");
    const a = saveHandover({ cwd: repo, title: "Same name", body: "a", root, owner: "5" });
    git("checkout", "-q", "main");
    saveHandover({ cwd: repo, title: "Same name", body: "b", root, owner: "6" });
    const one = saveHandover({ cwd: repo, title: "Only one", body: "the only body", root, owner: ME });

    const dup = load(["--peek", "Same name"]);
    expect(dup.status).toBe(1);
    expect(dup.stderr).toMatch(/2 waiting handovers are titled "Same name"/);
    expect(record(a.path).status).toBe("waiting");

    const out = load(["Only one"]);
    expect(out.stdout).toContain("the only body");
    expect(record(one.path).status).toBe("archived");
  });
});
