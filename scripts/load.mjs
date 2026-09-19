#!/usr/bin/env node
// Load one waiting handover by file name (as listed at session start), print it,
// and archive it. With no argument, lists what is waiting for this repo.
//   node load.mjs [<file>]
import { archive, listWaiting, repoInfo, repoKey, storeRoot } from "./lib/store.mjs";

const { top } = repoInfo(process.cwd());
const root = storeRoot();
const key = repoKey(top);
const waiting = listWaiting(root, key);
const want = process.argv[2];

if (!want) {
  if (!waiting.length) console.log("No handovers waiting for this repo.");
  for (const h of waiting) console.log(`${h.file}  "${h.meta.title ?? ""}" [${h.meta.branch ?? ""}]`);
  process.exit(0);
}

const h = waiting.find((w) => w.file === want || w.path === want);
if (!h) {
  console.error(`clear-resume: no waiting handover named ${want}. Run with no argument to list them.`);
  process.exit(1);
}
archive(root, key, h.path);
console.log(`Handover "${h.meta.title}" (branch ${h.meta.branch || "none"}, saved ${h.meta.created}):\n`);
console.log(h.body.trim());
