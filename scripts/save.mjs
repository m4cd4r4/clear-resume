#!/usr/bin/env node
// Save a handover for the current repo. The body is read from stdin.
//   node save.mjs --title "Short title" <<'EOF'
//   ...handover markdown...
//   EOF
// With CLEAR_RESUME_WEB=1 (or --commit) it is also pushed to its own ref,
// clear-resume/<branch>, for cloud sessions whose home folder does not survive.
import { readFileSync } from "node:fs";
import { listWaiting, repoInfo, saveHandover, storeRoot } from "./lib/store.mjs";
import { sessionRoot } from "./lib/session.mjs";
import { normalisePath } from "../packages/store/schema.mjs";
import { commitHandover, webEnabled } from "./lib/web.mjs";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

let body = "";
try {
  body = readFileSync(0, "utf8");
} catch {
  // no stdin
}

// The session root, not the cwd. A Bash `cd` moves the cwd for the rest of the
// session while the session resumes at its root, so filing against the cwd puts
// the handover where the next session never looks. --cwd overrides both, for a
// caller that genuinely knows better.
const startedIn = arg("--cwd") || sessionRoot() || process.cwd();

try {
  const { path, id, top, main, superseded } = saveHandover({ cwd: startedIn, title: arg("--title"), body });
  console.log(`Saved handover: ${path}`);
  for (const p of superseded) console.log(`Archived older handover for this branch: ${p}`);
  if (normalisePath(startedIn) !== normalisePath(process.cwd()))
    console.log(`Filed against the session root ${normalisePath(startedIn)}, not the current directory.`);
  // A handover nobody can find is worse than none: the session is told to /clear
  // and starts empty with nothing saying a handover exists. So prove the record
  // comes back through the same lookup the SessionStart hook uses, from the main
  // checkout, before promising anything. This is cheap - the store is small - and
  // it is the only thing standing between a bad save and a lost session.
  const found = listWaiting(storeRoot(), main).some((h) => h.id === id);
  if (top !== main) console.log(`Written in the worktree ${top}, filed under ${main}.`);
  if (webEnabled() || process.argv.includes("--commit")) {
    const { top, branch } = repoInfo(startedIn);
    const r = commitHandover(top, path, branch);
    if (r.pushed) console.log(`Pushed to ${r.ref} (your branch is untouched), so a new cloud session can load it.`);
    else console.log(`Could not push the handover to ${r.ref} (${r.error}). A new cloud session will not see it.`);
  }
  if (found) {
    console.log(`After /clear, the next session in ${main} loads it automatically.`);
  } else {
    console.error(
      `clear-resume: WARNING - the handover saved but is NOT discoverable from ${main}, ` +
        `so /clear would start an empty session. Do not tell the user to clear. ` +
        `Load it by hand instead: node "${new URL("load.mjs", import.meta.url).pathname}" ${path}`,
    );
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`clear-resume: ${err.message}`);
  process.exit(1);
}
