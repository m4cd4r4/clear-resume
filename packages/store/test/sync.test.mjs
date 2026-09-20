import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listAll, read, remove, save, setPinned, update } from "../store.mjs";
import { initSync, isSynced, sync } from "../sync.mjs";

// Real git, two machines' worth of it per test, on Windows. The default 5s
// timeout is about the process spawns, not about anything under test.
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

// Two machines, one bare repo between them. Every test builds its own - the live
// store at ~/.clear-resume is never touched.
let tmp;
let remote;
let a;
let b;

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function base(overrides = {}) {
  return {
    title: "a handover",
    body: "body text",
    repoPath: "I:/Scratch/clear-resume",
    machine: "desk",
    pid: 1,
    createdAt: "2026-09-19T23:28:51.277Z",
    ...overrides,
  };
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cr-sync-"));
  remote = join(tmp, "remote.git");
  a = join(tmp, "machine-a");
  b = join(tmp, "machine-b");
  git(tmp, "init", "--bare", "--initial-branch=main", remote);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("initSync", () => {
  it("turns a store root into a repo and pushes what is already there", () => {
    save(base(), { root: a });
    expect(isSynced(a)).toBe(false);

    expect(initSync(a, remote).ok).toBe(true);
    expect(isSynced(a)).toBe(true);
    expect(git(remote, "ls-tree", "-r", "--name-only", "main")).toContain("handovers/");
  });
  it("joins a second machine to a remote that already has records", () => {
    save(base({ title: "from a" }), { root: a });
    initSync(a, remote);

    save(base({ title: "from b", machine: "laptop" }), { root: b });
    expect(initSync(b, remote).ok).toBe(true);

    expect(listAll(b).map((r) => r.title).sort()).toEqual(["from a", "from b"]);
  });
});

describe("sync", () => {
  it("carries a new handover from one machine to the other", () => {
    initSync(a, remote);
    initSync(b, remote);

    save(base({ title: "written on a" }), { root: a });
    expect(sync(a).ok).toBe(true);
    expect(sync(b).ok).toBe(true);

    expect(listAll(b).map((r) => r.title)).toEqual(["written on a"]);
  });

  // The reason remove() writes a tombstone instead of unlinking. An absent file is
  // not a delete - the machine that still has the original just puts it back.
  it("carries a delete, and the record does not come back from the other machine", () => {
    initSync(a, remote);
    const { id } = save(base(), { root: a });
    sync(a);
    initSync(b, remote);
    expect(listAll(b)).toHaveLength(1);

    remove(id, { root: a });
    sync(a);
    sync(b);

    expect(listAll(b)).toEqual([]);
    expect(read(id, b).status).toBe("deleted");

    sync(b);
    sync(a);
    expect(listAll(a)).toEqual([]);
  });

  it("reports offline rather than throwing, and keeps the work for next time", () => {
    initSync(a, remote);
    save(base(), { root: a });
    rmSync(remote, { recursive: true, force: true });

    const result = sync(a);
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(listAll(a)).toHaveLength(1);
  });

  it("reports not-synced rather than failing when the root is not a repo", () => {
    save(base(), { root: a });
    expect(sync(a).reason).toMatch(/not synced/i);
  });
});

describe("conflicting rewrites", () => {
  // Filenames carry the machine, so two machines can never create the same path.
  // The only collision possible is both of them rewriting one record.
  it("keeps the later updatedAt when both machines rewrote one record", () => {
    initSync(a, remote);
    const { id } = save(base(), { root: a });
    sync(a);
    initSync(b, remote);

    update(id, { branch: "from-a" }, { root: a, now: new Date("2026-09-21T00:00:00.000Z") });
    update(id, { branch: "from-b" }, { root: b, now: new Date("2026-09-22T00:00:00.000Z") });

    sync(a);
    const result = sync(b);
    expect(result.ok).toBe(true);
    expect(result.resolved).toContain(id);
    expect(read(id, b).branch).toBe("from-b");

    sync(a);
    expect(read(id, a).branch).toBe("from-b");
  });

  it("lets an older local edit lose to a newer remote one", () => {
    initSync(a, remote);
    const { id } = save(base(), { root: a });
    sync(a);
    initSync(b, remote);

    update(id, { branch: "newer" }, { root: a, now: new Date("2026-09-25T00:00:00.000Z") });
    setPinned(id, true, { root: b, now: new Date("2026-09-21T00:00:00.000Z") });

    sync(a);
    sync(b);

    expect(read(id, b).branch).toBe("newer");
    expect(read(id, b).pinned).toBe(false);
  });

  it("a delete beats a concurrent edit when the delete is later", () => {
    initSync(a, remote);
    const { id } = save(base(), { root: a });
    sync(a);
    initSync(b, remote);

    setPinned(id, true, { root: b, now: new Date("2026-09-21T00:00:00.000Z") });
    remove(id, { root: a, now: new Date("2026-09-22T00:00:00.000Z") });

    sync(a);
    sync(b);

    expect(listAll(b)).toEqual([]);
    expect(read(id, b).status).toBe("deleted");
  });
});

describe("sync.mjs CLI", () => {
  function cli(root, ...args) {
    return execFileSync(process.execPath, [join(import.meta.dirname, "../../../scripts/sync.mjs"), ...args], {
      env: { ...process.env, CLEAR_RESUME_HOME: root },
      encoding: "utf8",
    });
  }

  it("sets a store up against a remote and syncs it afterwards", () => {
    save(base({ title: "from the cli" }), { root: a });
    expect(cli(a, "init", remote)).toMatch(/synced/i);

    initSync(b, remote);
    expect(cli(b)).toMatch(/up to date/i);
    expect(listAll(b).map((r) => r.title)).toEqual(["from the cli"]);
  });

  it("says what to do instead of failing when the store is not set up", () => {
    save(base(), { root: a });
    const out = cli(a);
    expect(out).toMatch(/init/);
  });
});
