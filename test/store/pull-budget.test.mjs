// Claude Code kills a SessionStart hook after 10s. The hook hands pull() an 8s
// timeout, but pull() ran two git calls (fetch, then merge) and gave EACH the full
// timeout, so a slow fetch followed by a slow merge could spend 16s. On 2026-10-31
// at 20:26 the hook ran 10.4s, was killed, and the handover it had already moved to
// loaded/ never reached the session. The timeout has to be the budget for the whole
// pull: each git call gets only what is left of it.
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

describe("pull() against the hook's budget", () => {
  it("gives the merge only what the fetch left of the timeout", () => {
    fetchTakes = 600;
    pull(root, { timeout: 1000 });

    const fetch = calls.find((c) => c.verb === "fetch");
    const merge = calls.find((c) => c.verb === "merge");
    expect(fetch.timeout).toBeLessThanOrEqual(1000);
    expect(merge.timeout).toBeLessThanOrEqual(1000 - fetchTakes + 50);
  });
});
