#!/usr/bin/env node
// Turn syncing on for this machine's store, and run a sync by hand.
//
//   node scripts/sync.mjs init git@github.com:you/your-store.git
//   node scripts/sync.mjs
//
// The store holds every handover you have written - repo paths, branch names,
// whatever was in context at the time - so the remote should be a PRIVATE repo.
// Nothing here creates one for you, on purpose: where your work context is stored
// is a decision, not a default.
import { initSync, isSynced, sync } from "../packages/store/sync.mjs";
import { storeRoot } from "../packages/store/store.mjs";

const [command, remote] = process.argv.slice(2);
const root = storeRoot();

if (command === "init") {
  if (!remote) {
    console.error("usage: node scripts/sync.mjs init <remote-url>   (a PRIVATE repo)");
    process.exit(1);
  }
  const result = initSync(root, remote);
  if (!result.ok) {
    console.error(`clear-resume: could not set up syncing - ${result.reason}`);
    process.exit(1);
  }
  console.log(`clear-resume: ${root} is synced with ${remote}`);
  process.exit(0);
}

if (command && command !== "run") {
  console.error(`unknown command "${command}" - expected "init <remote-url>" or nothing`);
  process.exit(1);
}

if (!isSynced(root)) {
  console.log(`clear-resume: ${root} is not synced. Set it up with:\n  node scripts/sync.mjs init <remote-url>`);
  process.exit(0);
}

const result = sync(root);
if (!result.ok) {
  // Not an error exit: being offline is a normal state for this, and a non-zero
  // exit would make a hook that calls it look broken.
  console.log(`clear-resume: sync skipped - ${result.reason}`);
  process.exit(0);
}

const settled = result.resolved?.length ? `, ${result.resolved.length} conflict(s) settled by timestamp` : "";
console.log(`clear-resume: store is up to date${settled}`);
