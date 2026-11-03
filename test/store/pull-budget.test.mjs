// Claude Code kills a SessionStart hook after 10s. On 2026-10-31 at 20:26 the hook ran
// 10.4s, was killed, and the handover it had already moved to loaded/ never reached the
// session: pull() had given its fetch and its merge the full timeout each. pull() now
// spends one budget: the fetch gets the budget, a merge starts only with MIN_MERGE_MS
// (1s) left, and a started merge gets MERGE_MS (5s) of its own so it is never killed
// half way. With the hook's 4s budget the worst case stays under the 10s kill.
// Backfilled onto existing code (tdd-guard:allow); each case was seen failing on a mutant.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = [];
let fetchTakes = 0;

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    execFileSync: (cmd, args, opts) => {
      calls.push({ verb: args[0], timeout: opts?.timeout });
      if (args[0] === "fetch") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, fetchTakes);
      return "x";
    },
  };
});

const { pull } = await import("../../plugin/packages/store/sync.mjs");

let root;
beforeEach(() => {
  calls.length = 0;
  root = mkdtempSync(join(tmpdir(), "cr-pull-budget-"));
  mkdirSync(join(root, ".git"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const find = (verb) => calls.find((c) => c.verb === verb);

describe("pull() against the hook's budget", () => {
  it("starts no merge when the fetch leaves under a second", () => {
    fetchTakes = 600;
    const r = pull(root, { timeout: 1000 });

    expect(find("fetch").timeout).toBeLessThanOrEqual(1000);
    expect(find("merge")).toBeUndefined();
    expect(r).toMatchObject({ ok: false, reason: "out of time before the merge" });
  });

  it("keeps fetch plus merge under the hook's 10s kill at the hook's 4s budget", () => {
    fetchTakes = 2500;
    pull(root, { timeout: 4000 });

    const fetch = find("fetch");
    const merge = find("merge");
    expect(fetch.timeout).toBeLessThanOrEqual(4000);
    expect(merge).toBeDefined();
    expect(fetchTakes + merge.timeout).toBeLessThan(10000);
  });
});
