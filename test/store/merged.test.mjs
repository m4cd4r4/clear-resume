import { mkdtempSync, rmSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveMerged, prMerged } from "../../plugin/packages/store/merged.mjs";
import { listAll, save } from "../../plugin/packages/store/store.mjs";

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cr-merged-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const BASE = {
  title: "kickoff",
  body: "body",
  repoPath: tmpdir(),
  branch: "feat/x",
  machine: hostname(),
  pid: 1,
  createdAt: "2026-10-20T00:00:00.000Z",
};

describe("prMerged", () => {
  const gh = (prs) => async () => JSON.stringify(prs);
  const rec = { branch: "feat/x", repoPath: tmpdir(), createdAt: "2026-10-20T00:00:00.000Z" };

  it("counts a PR merged after the handover was written, and nothing else", async () => {
    expect(await prMerged(rec, gh([{ state: "MERGED", mergedAt: "2026-10-21T00:00:00Z" }]))).toBe(true);
    // Merged before the handover: the branch was reused, so this handover is new work.
    expect(await prMerged(rec, gh([{ state: "MERGED", mergedAt: "2026-10-19T00:00:00Z" }]))).toBe(false);
    // Still open alongside a merged one: not done.
    expect(await prMerged(rec, gh([{ state: "MERGED", mergedAt: "2026-10-21T00:00:00Z" }, { state: "OPEN", mergedAt: null }]))).toBe(false);
    expect(await prMerged(rec, gh([]))).toBe(false);
    // A detached HEAD is recorded as "detached@<sha>": not a branch gh can look up.
    expect(await prMerged({ ...rec, branch: "detached@0f8f9d4d" }, gh([{ state: "MERGED", mergedAt: "2026-10-21T00:00:00Z" }]))).toBe(false);
    expect(await prMerged({ ...rec, branch: "main" }, gh([{ state: "MERGED", mergedAt: "2026-10-21T00:00:00Z" }]))).toBe(false);
  });
});

describe("archiveMerged", () => {
  it("archives a waiting record on this machine whose branch has a merged PR", async () => {
    const { id } = save(BASE, { root });
    const done = await archiveMerged({ root, isMerged: async () => true });
    expect(done).toEqual([id]);
    const [after] = listAll(root);
    expect(after.status).toBe("archived");
    expect(after.archivedBy.via).toBe("merged");
  });

  it("leaves a record waiting when the check throws, or it is pinned or from another machine", async () => {
    save({ ...BASE, pid: 1 }, { root });
    save({ ...BASE, pid: 2, pinned: true }, { root });
    save({ ...BASE, pid: 3, machine: "elsewhere" }, { root });
    expect(await archiveMerged({ root, isMerged: async () => { throw new Error("offline"); } })).toEqual([]);
    expect(await archiveMerged({ root, isMerged: async (r) => r.pid !== "1" })).toEqual([]);
    expect(listAll(root).every((r) => r.status === "waiting")).toBe(true);
  });
});
