import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveRecord, handoversDir, listAll, prune, remove, save, setPinned } from "../store.mjs";

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
    expect(saved.path).toBe(join(handoversDir(root), "desk-1-2026-09-19T23-28-51Z.json"));
    expect(JSON.parse(readFileSync(saved.path, "utf8")).title).toBe("phase 1");
    expect(listAll(root).map((r) => r.id)).toEqual(["desk-1-2026-09-19T23-28-51Z"]);
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

  it("remove deletes the file, and removing a gone record is not an error", () => {
    const { id } = save(BASE, { root });
    expect(remove(id, { root })).toBe(true);
    expect(listAll(root)).toEqual([]);
    expect(remove(id, { root })).toBe(false);
  });
});

describe("prune", () => {
  it("deletes archived records past 30 days and spares pinned and waiting ones", () => {
    const long = "2026-01-01T00:00:00.000Z";
    save({ ...BASE, machine: "old-archived", createdAt: long, status: "archived", archivedAt: long }, { root });
    save({ ...BASE, machine: "old-pinned", createdAt: long, status: "archived", archivedAt: long, pinned: true }, { root });
    save({ ...BASE, machine: "old-waiting", createdAt: long }, { root });
    const removed = prune({ root, now: new Date("2026-09-20T00:00:00.000Z") });
    expect(removed).toEqual(["old-archived-1-2026-01-01T00-00-00Z"]);
    expect(listAll(root).map((r) => r.machine).sort()).toEqual(["old-pinned", "old-waiting"]);
  });
});
