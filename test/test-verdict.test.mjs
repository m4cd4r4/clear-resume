import { expect, it } from "vitest";
import { verdict } from "../scripts/lib/test-verdict.mjs";

const ok = { numTotalTests: 601, numPassedTests: 600, numPendingTests: 1, numFailedTests: 0, numFailedTestSuites: 0 };
const rpc = 'Error: [vitest-worker]: Timeout calling "onTaskUpdate"\n';
const summary = (n) => `\x1b[2m     Errors \x1b[22m \x1b[1m\x1b[31m${n} errors\x1b[39m\n`;

// Only a run whose every test passed, and whose every unhandled error is the late RPC reply, passes.
it("passes a green run that exited 1 only on the onTaskUpdate timeout, and nothing else", () => {
  const at = (code, results, output) => verdict({ code, results, output }).pass;
  expect(at(0, null, "")).toBe(true);
  expect(at(1, ok, rpc + rpc + summary(2))).toBe(true); // run 3, 2026-11-06
  expect(at(1, ok, rpc + summary(2))).toBe(false); // one other unhandled error
  expect(at(1, ok, "")).toBe(false); // exit 1 with no errors listed
  expect(at(1, { ...ok, numFailedTests: 1 }, rpc + summary(1))).toBe(false);
  expect(at(1, { ...ok, numPassedTests: 599 }, rpc + summary(1))).toBe(false); // a test with no result
  expect(at(1, null, rpc + summary(1))).toBe(false);
});
