#!/usr/bin/env node
// CLI entry for .githooks/post-merge and .githooks/post-rewrite - see
// "Developing this plugin" in README.md.
//
// The whole point of this script is that it must never fail the pull that
// triggered it. runHook() already fails soft internally; this top-level catch
// is the belt to its braces, and the hook always exits 0 regardless.
import { runHook } from "./lib/auto-update-hook.mjs";

try {
  runHook();
} catch (err) {
  console.log(`clear-resume auto-update: skipped (unexpected error: ${err && err.message ? err.message : err})`);
}
process.exit(0);
