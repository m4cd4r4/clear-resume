// Test seam: a whole-number multiplier for the fixed git time limits in web.mjs and sync.mjs.
// Unset in real use, so every limit is as written. vitest.config.mjs sets it, because on a
// busy machine single test git calls ran past the 8s push limit and the test failed for the
// clock, not the code (2026-11-06, issue #178). Explicit budgets a caller passes, and the
// merge budgets in sync.mjs, are not scaled: their tests are about running out of time.
export const gitSlack = (env = process.env) => {
  const n = Number.parseInt(env.CORNERMAN_TEST_GIT_SLACK ?? "", 10);
  return Number.isInteger(n) && n > 1 ? Math.min(n, 10) : 1;
};
