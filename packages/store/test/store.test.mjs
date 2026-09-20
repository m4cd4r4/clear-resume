import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveRecord, handoversDir, listAll, prune, read, remove, save, setPinned, update } from "../store.mjs";

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
  repoPath: "I:/Scratch/clear-resume",
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

describe("mutations", () => {
  it("archiving stamps archivedAt so the same handover cannot load twice", () => {
    const { id } = save(BASE, { root });
    const at = new Date("2026-09-20T01:00:00.000Z");
    const after = archiveRecord(id, { root, now: at });
    expect(after.status).toBe("archived");
    expect(after.archivedAt).toBe(at.toISOString());
    expect(listAll(root)[0].status).toBe("archived");
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
  it("deletes archived records past 30 days and spares pinned and waiting ones", () => {
    const long = "2026-01-01T00:00:00.000Z";
    save({ ...BASE, machine: "old-archived", createdAt: long, status: "archived", archivedAt: long }, { root });
    save({ ...BASE, machine: "old-pinned", createdAt: long, status: "archived", archivedAt: long, pinned: true }, { root });
    save({ ...BASE, machine: "old-waiting", createdAt: long }, { root });
    const removed = prune({ root, now: new Date("2026-09-20T00:00:00.000Z") });
    expect(removed).toEqual(["old-archived-1-2026-01-01T00-00-00-000Z"]);
    expect(listAll(root).map((r) => r.machine).sort()).toEqual(["old-pinned", "old-waiting"]);

    // Stage one only. The record left the tree but is still a fact on disk, so
    // the other machine can be told it went.
    const tombs = listAll(root, { includeDeleted: true }).filter((r) => r.status === "deleted");
    expect(tombs.map((r) => r.machine)).toEqual(["old-archived"]);
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
