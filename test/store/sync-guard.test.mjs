// One machine upgraded, one not. A machine before the rename still turns archived records
// past 30 days into tombstones, and that write would wipe the body everywhere.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateStore } from "../../plugin/packages/store/rename.mjs";
import { archiveRecord, read, remove, save, update } from "../../plugin/packages/store/store.mjs";
import { commitLocal, initSync, pull, sync } from "../../plugin/packages/store/sync.mjs";
import { GIT_TEST_TIMEOUT, removeTemp } from "../helpers/git-temp.mjs";

vi.setConfig({ testTimeout: GIT_TEST_TIMEOUT, hookTimeout: GIT_TEST_TIMEOUT });

let tmp;
let remote;
let upgraded;
let old;

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const ARCHIVED = new Date("2026-09-01T00:00:00.000Z");
const AGED_OUT = new Date("2026-10-15T00:00:00.000Z");

/** An archived record on both machines. */
function shared() {
  const { id } = save({ title: "a handover", body: "body text", repoPath: "I:/Scratch/app", machine: "desk", pid: 1, createdAt: "2026-08-20T00:00:00.000Z" }, { root: upgraded, now: ARCHIVED });
  archiveRecord(id, { root: upgraded, now: ARCHIVED });
  initSync(upgraded, remote);
  initSync(old, remote);
  return id;
}

/** What prune() did before the rename, on the machine that has not upgraded. */
function ageOutOnOldMachine(id, now = AGED_OUT) {
  update(id, { status: "deleted", body: "", resumePrompt: "", deletedAt: now.toISOString() }, { root: old, now });
  sync(old);
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cr-guard-"));
  remote = join(tmp, "remote.git");
  upgraded = join(tmp, "upgraded");
  old = join(tmp, "old");
  git(tmp, "init", "--bare", "--initial-branch=main", remote);
});

afterEach(() => {
  removeTemp(tmp);
});

describe("a moved store and a machine that has not moved", () => {
  it("still share handovers both ways through the same remote", () => {
    const home = join(tmp, "home");
    const before = join(home, ".clear-resume");
    const after = join(home, ".cornerman");
    const first = save({ title: "before the move", body: "b", repoPath: "I:/Scratch/app", machine: "desk", pid: 1 }, { root: before });
    initSync(before, remote);
    initSync(old, remote);

    expect(migrateStore({ home }).state).toBe("moved");
    expect(read(first.id, after).title).toBe("before the move");

    const fromMoved = save({ title: "from the moved store", body: "b", repoPath: "I:/Scratch/app", machine: "desk", pid: 2 }, { root: after });
    expect(sync(after).ok).toBe(true);
    expect(sync(old).ok).toBe(true);
    expect(read(fromMoved.id, old).title).toBe("from the moved store");

    const fromOld = save({ title: "from the old store", body: "b", repoPath: "I:/Scratch/app", machine: "laptop", pid: 3 }, { root: old });
    expect(sync(old).ok).toBe(true);
    expect(sync(after).ok).toBe(true);
    expect(read(fromOld.id, after).title).toBe("from the old store");
  });

  it("restarts the archive clock on a restored record, so an old machine does not empty it again at its next prune", () => {
    const id = shared();
    ageOutOnOldMachine(id);

    pull(upgraded);

    const restored = read(id, upgraded);
    expect(restored.body).toBe("body text");
    expect(Date.parse(restored.archivedAt)).toBeGreaterThan(AGED_OUT.getTime());
  });

  it("keeps the body of a record still waiting here that an old machine archived and aged out", () => {
    const { id } = save({ title: "offline here", body: "body text", repoPath: "I:/Scratch/app", machine: "desk", pid: 1, createdAt: "2026-08-20T00:00:00.000Z" }, { root: upgraded, now: ARCHIVED });
    initSync(upgraded, remote);
    initSync(old, remote);
    archiveRecord(id, { root: old, now: ARCHIVED });
    ageOutOnOldMachine(id);

    pull(upgraded);

    const restored = read(id, upgraded);
    expect(restored.body).toBe("body text");
    expect(restored.status).toBe("archived");
  });

  it("does not send what an interrupted move left behind to the remote", () => {
    const { id } = save({ title: "kept", body: "b", repoPath: "I:/Scratch/app", machine: "desk", pid: 1 }, { root: upgraded });
    initSync(upgraded, remote);
    mkdirSync(join(upgraded, ".git.carry.tmp"));
    writeFileSync(join(upgraded, ".git.carry.tmp", "config"), "url = https://token@example.com/x.git\n");
    writeFileSync(join(upgraded, "handovers", `${id}.json.77.tmp`), "half");

    expect(sync(upgraded).ok).toBe(true);

    expect(git(remote, "ls-tree", "-r", "--name-only", "main")).not.toMatch(/\.tmp/);
  });
});

describe("a pull that brings an age-out from a machine not yet upgraded", () => {
  it("keeps the body, and the restored record goes back out to the other machine", () => {
    const id = shared();
    ageOutOnOldMachine(id);

    expect(pull(upgraded).ok).toBe(true);
    expect(read(id, upgraded).status).toBe("archived");
    expect(read(id, upgraded).body).toBe("body text");
    expect(git(upgraded, "status", "--porcelain")).toBe("");

    expect(sync(upgraded).ok).toBe(true);
    expect(sync(old).ok).toBe(true);
    expect(read(id, old).body).toBe("body text");
  });

  it("a person's delete on an upgraded machine stays deleted, however old the record", () => {
    const id = shared();
    remove(id, { root: old, now: AGED_OUT });
    expect(read(id, old).deletedBy).toBe("person");
    sync(old);

    expect(pull(upgraded).ok).toBe(true);
    expect(read(id, upgraded).status).toBe("deleted");
  });

  it("an old machine's delete inside the 30 days can only be a person's, so it stays deleted", () => {
    const id = shared();
    ageOutOnOldMachine(id, new Date("2026-09-10T00:00:00.000Z"));

    expect(pull(upgraded).ok).toBe(true);
    expect(read(id, upgraded).status).toBe("deleted");
  });

  it("when the age-out conflicts with a local change, the conflict settles and the local version comes back", () => {
    const id = shared();
    update(id, { pinned: false, title: "renamed here" }, { root: upgraded, now: new Date("2026-10-10T00:00:00.000Z") });
    commitLocal(upgraded);
    ageOutOnOldMachine(id);

    expect(pull(upgraded).ok).toBe(true);
    expect(read(id, upgraded).status).toBe("archived");
    expect(read(id, upgraded).title).toBe("renamed here");
    expect(read(id, upgraded).body).toBe("body text");
    expect(git(upgraded, "status", "--porcelain")).toBe("");
  });

  it("a record that was already a tombstone here is not brought back by a later rewrite of it", () => {
    const id = shared();
    remove(id, { root: upgraded, now: AGED_OUT });
    sync(upgraded);
    sync(old);
    update(id, { deletedAt: "2026-10-20T00:00:00.000Z" }, { root: old, now: new Date("2026-10-20T00:00:00.000Z") });
    sync(old);

    expect(pull(upgraded).ok).toBe(true);
    expect(read(id, upgraded).status).toBe("deleted");
  });
});
