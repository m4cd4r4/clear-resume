// Whether a vitest run passed, read from its results rather than its exit code alone.
//
// On a busy Windows machine a run can pass every test and still exit 1: the worker is blocked in
// synchronous git, the reply to its "onTaskUpdate" report arrives late, and vitest counts the late
// reply as an unhandled error (issue #178; CI has never shown it). That error never changes a
// result. Any other unhandled error, any failed or missing test, still fails.
const RPC = /Timeout calling "onTaskUpdate"/g;
const ANSI = /\x1b\[[0-9;]*m/g;

export function verdict({ code, results, output }) {
  if (code === 0) return { pass: true, note: "" };
  if (!results) return { pass: false, note: "no results file: vitest did not finish" };
  const { numTotalTests: total, numPassedTests: passed, numPendingTests: skipped = 0, numTodoTests: todo = 0 } = results;
  if (results.numFailedTests > 0 || results.numFailedTestSuites > 0) return { pass: false, note: "tests failed" };
  if (total !== passed + skipped + todo) return { pass: false, note: `${total - passed - skipped - todo} tests have no result` };
  const text = output.replace(ANSI, "");
  const errors = Number(text.match(/Errors\s+(\d+) errors?/)?.[1] ?? 0);
  const rpc = text.match(RPC)?.length ?? 0;
  if (errors === 0 || rpc !== errors) return { pass: false, note: `exit ${code} with ${errors} unhandled errors, ${rpc} of them the onTaskUpdate timeout` };
  return { pass: true, note: `every test passed; ignored ${rpc} late onTaskUpdate repl${rpc === 1 ? "y" : "ies"} (issue #178)` };
}
