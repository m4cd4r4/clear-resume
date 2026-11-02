import { existsSync, mkdtempSync, rmSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveRecord, handoversDir, listAll, prune, read, remove, save, setPinned, update } from "../../plugin/packages/store/store.mjs";
import { listCaptures, writeCapture } from "../../plugin/packages/store/artifacts.mjs";

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cr-store-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const BASE = {
  title: "phase 1",
  body: "body text",
  repoPath: "I:/Scratch/cornerman",
  machine: "desk",
  pid: 1,
  createdAt: "2026-09-19T23:28:51.277Z",
};

describe("save + listAll", () => {
  it("writes one json file under <root>/handovers and reads it back", () => {
    const saved = save(BASE, { root });
    expect(saved.path).toBe(join(handoversDir(root), "desk-1-2026-09-19T23-28-51-277Z.json"));
    expect(JSON.parse(readFileSync(saved.path, "utf8")).title).toBe("phase 1");
    expect(listAll(root).map((r) => r.id)).toEqual(["desk-1-2026-09-19T23-28-51-277Z"]);
  });
});

// listAll re-read and parsed every record on each call: 1,862 records took 257 ms,
// on the extension host, several times per store change and in every window. The
// host froze for seconds at a time and Claude Code's chat tab reported "stopped
// responding" (2026-10-29). Unchanged files now come from a cache keyed on mtime + size.
describe("listAll cache", () => {
  it("does not re-read a file whose mtime and size are unchanged", () => {
    const saved = save(BASE, { root });
    const t = new Date("2026-10-01T00:00:00Z"); // whole seconds: utimes keeps them exactly
    utimesSync(saved.path, t, t);
    expect(listAll(root)[0].title).toBe("phase 1");
    writeFileSync(saved.path, readFileSync(saved.path, "utf8").replace("phase 1", "phase 9"));
    utimesSync(saved.path, t, t);
    expect(listAll(root)[0].title).toBe("phase 1");
  });
});

describe("mutations", () => {
  it("archiving stamps archivedAt so the same handover cannot load twice", () => {
    const { id } = save(BASE, { root });
    const at = new Date("2026-09-20T01:00:00.000Z");
    const after = archiveRecord(id, { root, now: at });
    expect(after.status).toBe("archived");
    expect(after.archivedAt).toBe(at.toISOString());
    expect(listAll(root)[0].status).toBe("archived");
  });

  // A handover that left the waiting list with no trace of what took it cost a
  // long diagnosis (2026-09-27). The stamp has to outlive the next rewrite.
  it("archiving records who archived it, and a later write keeps that", () => {
    const { id } = save(BASE, { root });
    const by = { owner: "30180", pid: "4242", via: "load" };
    expect(archiveRecord(id, { root, by }).archivedBy).toEqual(by);
    setPinned(id, true, { root });
    expect(read(id, root).archivedBy).toEqual(by);
    expect(listAll(root)[0].archivedBy).toEqual(by);
  });

  it("pinning survives a reread and is reversible", () => {
    const { id } = save(BASE, { root });
    expect(setPinned(id, true, { root }).pinned).toBe(true);
    expect(listAll(root)[0].pinned).toBe(true);
    expect(setPinned(id, false, { root }).pinned).toBe(false);
  });

  // A delete has to survive as a fact on disk. Unlinking the file would mean any
  // machine still holding the original restores it on the next sync, forever.
  it("remove leaves a tombstone: gone from the tree, still on disk, body dropped", () => {
    const { id, path } = save(BASE, { root });
    expect(remove(id, { root })).toBe(true);
    expect(listAll(root)).toEqual([]);
    expect(existsSync(path)).toBe(true);

    const tomb = read(id, root);
    expect(tomb.status).toBe("deleted");
    expect(tomb.body).toBe("");
    expect(tomb.deletedAt).toBeTruthy();
    expect(tomb.title).toBe("phase 1");
    expect(listAll(root, { includeDeleted: true }).map((r) => r.id)).toEqual([id]);
  });

  it("removing an already-deleted or unknown record is not an error", () => {
    const { id } = save(BASE, { root });
    expect(remove(id, { root })).toBe(true);
    expect(remove(id, { root })).toBe(false);
    expect(remove("no-such-1-2026-01-01T00-00-00-000Z", { root })).toBe(false);
  });

  // Two machines can both rewrite one record. updatedAt is what decides which
  // version wins when the store is synced.
  it("stamps updatedAt on every rewrite", () => {
    const { id } = save(BASE, { root });
    expect(read(id, root).updatedAt).toBe(BASE.createdAt);
    const at = new Date("2026-09-21T00:00:00.000Z");
    expect(update(id, { branch: "main" }, { root, now: at }).updatedAt).toBe(at.toISOString());
  });
});

describe("prune", () => {
  it("keeps an archived record and its body however old it gets", () => {
    const long = "2026-01-01T00:00:00.000Z";
    const { id } = save({ ...BASE, machine: "old-archived", createdAt: long, status: "archived", archivedAt: long }, { root });
    expect(prune({ root, now: new Date("2036-01-01T00:00:00.000Z") })).toEqual([]);
    const after = read(id, root);
    expect(after.status).toBe("archived");
    expect(after.body).toBe(BASE.body);
  });

  it("keeps the capture of an archived handover, and drops those of a deleted one and of none", () => {
    const long = "2026-01-01T00:00:00.000Z";
    const capture = (sessionId) => ({ sessionId, capturedAt: long, items: [], lastScreen: "" });
    save({ ...BASE, sessionId: "archived-one", createdAt: long, status: "archived", archivedAt: long }, { root });
    const { id } = save({ ...BASE, machine: "other", sessionId: "deleted-one", createdAt: long }, { root });
    remove(id, { root, now: new Date("2026-09-19T00:00:00.000Z") });
    for (const s of ["archived-one", "deleted-one", "no-handover"]) writeCapture(root, capture(s));

    prune({ root, now: new Date("2026-09-20T00:00:00.000Z") });

    expect(listCaptures(root).map((c) => c.sessionId)).toEqual(["archived-one"]);
  });

  it("archives a waiting record on this machine whose repo folder is gone", () => {
    const { id } = save({ ...BASE, machine: hostname(), repoPath: join(root, "gone-worktree") }, { root });
    expect(prune({ root, now: new Date("2026-09-20T00:00:00.000Z") })).toEqual([id]);
    const after = read(id, root);
    expect(after.status).toBe("archived");
    expect(after.archivedBy.via).toBe("abandoned");
  });

  it("unlinks a tombstone only once it is 90 days old", () => {
    const long = "2026-01-01T00:00:00.000Z";
    const { id, path } = save({ ...BASE, createdAt: long }, { root });
    remove(id, { root, now: new Date("2026-06-01T00:00:00.000Z") });

    prune({ root, now: new Date("2026-07-01T00:00:00.000Z") });
    expect(existsSync(path)).toBe(true);

    expect(prune({ root, now: new Date("2026-12-01T00:00:00.000Z") })).toEqual([id]);
    expect(existsSync(path)).toBe(false);
  });
});

describe("save collisions", () => {
  it("keeps both when two handovers land in the same second from one window", () => {
    const at = new Date("2026-09-20T01:02:03.000Z");
    const one = save({ ...BASE, title: "first", body: "a", createdAt: at }, { root });
    const two = save({ ...BASE, title: "second", body: "b", createdAt: at }, { root });

    expect(two.id).not.toBe(one.id);
    expect(listAll(root).map((r) => r.title).sort()).toEqual(["first", "second"]);
  });
});
