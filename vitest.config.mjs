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
  },
});
