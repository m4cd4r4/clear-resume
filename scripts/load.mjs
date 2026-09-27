#!/usr/bin/env node
// Load one waiting handover by file name (as listed at session start) and print it.
// With no file, lists what is waiting for this repo.
//   node load.mjs [--peek | --take] [<file>]
//
//   (no flag)  print it, and archive it - unless another open window owns it
//   --peek     print it, never archive it, whoever owns it
//   --take     print it and archive it here, whoever owns it
//
// Reading is not taking. On 2026-09-27 a second panel read another window's
// handover just to show the user its plan, the read archived it, and that
// window's /clear a minute later found nothing waiting.
import { archive, listWaiting, repoInfo, repoKey, storeRoot } from "./lib/store.mjs";
import { ownerId, ownerOpen } from "./lib/owner.mjs";
import { markConsumed } from "./lib/web.mjs";

const args = process.argv.slice(2);
const peek = args.includes("--peek");
const take = args.includes("--take");
const want = args.find((a) => !a.startsWith("--"));

// A typo such as --peak must not fall through to a load that archives.
const unknown = args.filter((a) => a.startsWith("--") && a !== "--peek" && a !== "--take");
if (unknown.length) {
  console.error(`clear-resume: unknown option ${unknown.join(", ")}. Options are --peek and --take.`);
  process.exit(1);
}
if (peek && take) {
  console.error("clear-resume: --peek and --take contradict each other. Use one.");
  process.exit(1);
}

const { top } = repoInfo(process.cwd());
const root = storeRoot();
const key = repoKey(top);
const waiting = listWaiting(root, key);

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

if (peek) {
  console.log("clear-resume: peek only, the handover stays waiting.\n");
} else {
  const me = ownerId();
  const owner = h.meta.owner;
  const theirs = Boolean(owner) && owner !== me && ownerOpen(owner);
  if (theirs && !take) {
    console.log(
      `clear-resume: read only. This handover belongs to another open Claude window (pid ${owner}), ` +
        `so it stays waiting for that window's /clear. To move it to this session instead: ` +
        `node "${process.argv[1]}" --take ${h.file}\n`,
    );
  } else {
    archive(root, key, h.path, { via: "load", owner: me });
    // The same consume mark the SessionStart hook writes, so a copy of this
    // handover carried in git is not offered again, and the twin check agrees.
    markConsumed(root, key, h.meta);
  }
}

console.log(`Handover "${h.meta.title}" (branch ${h.meta.branch || "none"}, saved ${h.meta.created}):\n`);
console.log(h.body.trim());
