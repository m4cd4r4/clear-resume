#!/usr/bin/env node
// Load one waiting handover and print it. It is named by the short id this script
// lists, the file name the SessionStart hook lists, or its exact title. With no
// name, lists what is waiting for this repo.
//   node load.mjs [--peek | --take] [<id> | <file> | <title>]
//
//   (no flag)  print it, and archive it - unless another open window owns it
//   --peek     print it, never archive it, whoever owns it
//   --take     print it and archive it here, whoever owns it
//
// --peek and --take also accept a handover a session has already loaded (the
// SessionStart hook or this script archived it), so one whose window has closed
// can still be read, or made this window's again: --take puts it back to waiting,
// owned here, for this window's next /clear. A superseded or deleted one is not
// found. A load writes a readable copy to <store>/loaded and names it.
//
// Reading is not taking. On 2026-09-27 a second panel read another window's
// handover just to show the user its plan, the read archived it, and that
// window's /clear a minute later found nothing waiting.
import { existsSync } from "node:fs";
import { archive, listLoaded, listWaiting, reopen, repoInfo, repoKey, storeRoot } from "./lib/store.mjs";
import { ownerId, ownerOpen, parseOwner, PATIENT_TIMEOUT_MS, sameOwner } from "./lib/owner.mjs";
import { markConsumed } from "./lib/web.mjs";
import { shellPath, tildePath } from "./lib/display.mjs";
import { age } from "./lib/select.mjs";
import { loadedCopyPath, writeLoadedCopy } from "../packages/store/loaded.mjs";

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
  // The short id, not the file name: that carries the machine name.
  for (const h of waiting) console.log(`${h.short}  "${h.meta.title ?? ""}" [${h.meta.branch ?? ""}]`);
  process.exit(0);
}

const named = (list) => {
  const byName = list.filter((w) => [w.short, w.file, w.path, w.id].includes(want));
  return byName.length ? byName : list.filter((w) => w.meta.title === want);
};
// A waiting handover wins. Only when none matches is a handover this repo already
// loaded looked for, so a window that has closed does not take its handover with
// it: --peek reads it and --take makes it waiting again (2026-09-28).
const inWaiting = named(waiting);
const found = inWaiting.length ? inWaiting : named(listLoaded(root, key));
const wasLoaded = !inWaiting.length && found.length > 0;
if (found.length > 1 && wasLoaded) {
  // The listing below shows only waiting ones, so the ids are given here.
  console.error(`clear-resume: ${found.length} loaded handovers are titled "${want}". Name one by its id:`);
  for (const f of found) console.error(`  ${f.short}  loaded ${age(f.archivedAt)}`);
  process.exit(1);
}
if (found.length > 1) {
  console.error(`clear-resume: ${found.length} waiting handovers are titled "${want}". Name one by its id; run with no argument to list them.`);
  process.exit(1);
}
const [h] = found;
if (!h) {
  console.error(`clear-resume: no waiting or loaded handover named ${want}. Run with no argument to list the waiting ones.`);
  process.exit(1);
}
const copySource = { id: h.id, title: h.meta.title, repoPath: h.meta.repo || top, branch: h.meta.branch, createdAt: h.meta.created, body: h.body };

if (wasLoaded && take) {
  // Like a --take of a waiting one, whoever loaded it. It goes back to waiting
  // rather than being loaded again here, so this window's /clear starts from it
  // in a fresh context, and it stays out of any other open window's.
  const me = ownerId(process.env, { timeout: PATIENT_TIMEOUT_MS });
  reopen(root, h.path, { owner: me });
  console.log(
    me
      ? "clear-resume: taken. This handover is waiting again and belongs to this window: this window's next /clear picks it up, and no other open window loads it.\n"
      : "clear-resume: taken. This handover is waiting again. This window could not be identified, so the next /clear on its branch picks it up.\n",
  );
} else if (wasLoaded && !peek) {
  // A plain load means "resume this", and this one has been resumed already.
  // Loading it again would be a guess at which of the two the user meant.
  const self = `node ${shellPath(process.argv[1])}`;
  console.error(
    `clear-resume: "${h.meta.title}" was already loaded ${age(h.archivedAt)}. To read it: ${self} --peek ${h.short}\n` +
      `To make it this window's again, for its next /clear: ${self} --take ${h.short}`,
  );
  process.exit(1);
} else if (peek && wasLoaded) {
  console.log(`clear-resume: peek only. This handover was already loaded ${age(h.archivedAt)} and stays archived.\n`);
  const copy = loadedCopyPath(root, copySource);
  if (existsSync(copy)) console.log(`A copy to read or share: ${tildePath(copy)}\n`);
} else if (peek) {
  console.log("clear-resume: peek only, the handover stays waiting.\n");
} else {
  // No time budget here, so the process lookup may take as long as it needs.
  const me = ownerId(process.env, { timeout: PATIENT_TIMEOUT_MS });
  const owner = h.meta.owner;
  const theirs = Boolean(owner) && !sameOwner(owner, me) && ownerOpen(owner, { timeout: PATIENT_TIMEOUT_MS });
  if (theirs && !take) {
    console.log(
      `clear-resume: read only. This handover belongs to another open Claude window (pid ${parseOwner(owner).pid}), ` +
        `so it stays waiting for that window's /clear. To move it to this session instead: ` +
        `node ${shellPath(process.argv[1])} --take ${h.short}\n`,
    );
  } else {
    archive(root, key, h.path, { via: "load", owner: me });
    // The same consume mark the SessionStart hook writes, so a copy of this
    // handover carried in git is not offered again, and the twin check agrees.
    markConsumed(root, key, h.meta);
    // The same readable copy the hook writes. Best effort: null skips the line.
    const copy = writeLoadedCopy(root, copySource);
    if (copy) console.log(`A copy to read or share: ${tildePath(copy)}\n`);
  }
}

console.log(`Handover "${h.meta.title}" (branch ${h.meta.branch || "none"}, saved ${h.meta.created}):\n`);
console.log(h.body.trim());
