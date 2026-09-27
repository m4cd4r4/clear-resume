#!/usr/bin/env node
// SessionStart hook (startup | clear): loads the waiting handover for this repo
// into the new session's context, then archives it so it loads exactly once.
// Any failure exits 0 with no output: a broken plugin must never block a session.
// It never writes to the user's repo. The one thing it may delete there is an
// untracked working-tree handover it just loaded, and only once the output is out.
import { readFileSync } from "node:fs";
import { run } from "./lib/hook.mjs";

let out = null;
try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  out = run(input);
} catch {
  // never block a session
}
if (!out) process.exit(0);
try {
  process.stdout.write(JSON.stringify(out), () => {
    try {
      out.afterOutput?.();
    } catch {
      // The copy stays. It is marked consumed, so it is not loaded again.
    }
    process.exit(0);
  });
} catch {
  process.exit(0);
}
