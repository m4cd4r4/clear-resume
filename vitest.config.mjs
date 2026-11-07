import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The sync tests drive real git, synchronously, with timeouts up to 30s. Run
    // alongside the other files they starve the reporter's RPC channel, and the run
    // ends with "Timeout calling onTaskUpdate": an unhandled error that fails nothing
    // and would hide a real one behind it.
    //
    // Capping the pool at two forks was measured and does not fix it. Serial does,
    // and costs about 30s: the sync file is 80s of the run on its own, so there was
    // never much left to overlap.
    fileParallelism: false,
    // Serial was not the whole fix: one file with over 60s of synchronous git still timed
    // out on its own (test/web.test.mjs alone, 2026-11-06). The yield is the rest of it.
    setupFiles: ["test/setup/yield-between-tests.mjs"],
    // vitest cannot stop a synchronous test, so a limit only relabels a slow pass. 5s was
    // reached by run, loader and extension-bundle tests at 100% CPU (2026-11-06).
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // test/mod/ holds the relay mod's tests, which run under `claude plugin test`
    // (npm run test:mod), not vitest: they import claude-code/testing.
    // site/*.test.mjs are plain node scripts that exit with their result; the Pages
    // workflow runs them.
    // .claude/worktrees/ holds agent checkouts of this repo. Their copies of the
    // files above do not match the relative patterns, so a run from the main checkout
    // picked them up: 10 failing files (no node_modules there) and a 17-minute run.
    exclude: ["**/node_modules/**", ".claude/worktrees/**", "test/mod/**", "site/**"],
    // Run as if outside any Claude window: a real CLAUDE_PID from the shell that
    // launched the tests would make every save in every test one owner's.
    // CORNERMAN_NO_MIGRATE: a test calling run() must never move the real store.
    // CORNERMAN_TEST_GIT_SLACK: four times the product's fixed git limits (git-slack.mjs), so a
    // busy machine fails a test only when git is really stuck.
    // CLAUDE_CODE_SESSION_ID: a save run from a Claude session read that session's real
    // transcript for its Recent trail, so a test handover carried the caller's paths and the
    // global pre-push leak guard refused the web tests' pushes (2026-11-07). Tests that need
    // a session id set their own.
    env: { CLAUDE_PID: "", CLAUDE_CODE_SESSION_ID: "", CORNERMAN_NO_PROCESS_WALK: "1", CORNERMAN_NO_MIGRATE: "1", CORNERMAN_TEST_GIT_SLACK: "4" },
  },
});
