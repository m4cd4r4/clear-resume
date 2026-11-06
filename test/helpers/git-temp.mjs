// Shared by the test files that drive real git against a temp folder (web, sync, sync-guard).
import { rmSync } from "node:fs";

// These tests run git synchronously, and vitest cannot stop a synchronous test: a timeout only
// relabels a slow pass as a fail once it returns. On a busy machine (87% CPU, 2026-11-06) single
// tests took 17-39s and three failed on the old 30s limit with nothing wrong. A real hang is
// bounded by the product's own per-call git timeouts, not by this number.
export const GIT_TEST_TIMEOUT = 120_000;

// Windows can hold a just-used temp folder for a while: a git child that outlived a timed-out
// call, or a scanner. rmSync's own retry backs off linearly, 100ms more per try, so 20 tries
// wait about 21s in all. A folder that still will not go is left in the OS temp folder with a
// warning: it says nothing about the code under test, and failing the test for it made a red
// run mean "the disk was busy" (3 EPERM failures at 100% CPU, 2026-11-06).
export function removeTemp(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  } catch (err) {
    console.warn(`left a temp folder behind (${err.code}): ${dir}`);
  }
}
