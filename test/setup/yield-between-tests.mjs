// Let the worker read its IPC between tests.
//
// The git-driving tests (web, sync) run real git synchronously, 5 to 14s a test. Vitest's
// runner moves from one test to the next on promise microtasks only, so the worker's event
// loop never reaches its poll phase inside a file: the reply to its "onTaskUpdate" RPC sits
// unread in the pipe. Past 60s of such a file the RPC's timer fires first, and the run exits
// 1 with "Timeout calling onTaskUpdate" though every test passed.
//
// Measured 2026-11-06 with a probe that only blocks (Atomics.wait, no git): 8 x 3s clean;
// 8 x 12s, 12 x 6s, 2 x 35s and 1 x 65s all hit the timeout; 8 x 12s with this hook, clean.
// setImmediate runs after the poll phase, so one turn of it is enough.
import { afterEach } from "vitest";

afterEach(() => new Promise((resolve) => setImmediate(resolve)));
