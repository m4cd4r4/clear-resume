#!/usr/bin/env node
// Save a handover for the current repo. The body is read from stdin.
//   node save.mjs --title "Short title" <<'EOF'
//   ...handover markdown...
//   EOF
// With CLEAR_RESUME_WEB=1 (or --commit) it is also pushed to its own ref,
// clear-resume/<branch>, for cloud sessions whose home folder does not survive.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { listWaiting, repoInfo, repoKey, saveHandover, storeRoot } from "./lib/store.mjs";
import { sessionRoot } from "./lib/session.mjs";
import { normalisePath } from "../packages/store/schema.mjs";
import { commitHandover, webEnabled } from "./lib/web.mjs";
import { ownerId, PATIENT_TIMEOUT_MS } from "./lib/owner.mjs";
import { shellPath, tildePath } from "./lib/display.mjs";
import { headless } from "./lib/auto-flag.mjs";
import { interactiveAuto } from "./lib/auto.mjs";

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
  // The owner's start time is what tells this window from a later process that
  // gets its pid, so a save waits for the lookup rather than use the hook budget.
  const owner = ownerId(process.env, { timeout: PATIENT_TIMEOUT_MS });
  // Under the headless runner every save is an auto one: the store is the
  // runner's own, and the runner sets which segment this is and what is left.
  // In VS Code a save is an auto one when the nudge asked for it and this window
  // has budget left; the extension then opens the next conversation.
  const auto = headless() ? { chain: process.env.CLEAR_RESUME_CHAIN, budget: process.env.CLEAR_RESUME_BUDGET } : interactiveAuto();
  const { path, id, short, title, top, main, replaced } = saveHandover({ cwd: startedIn, title: arg("--title"), body, owner, auto });
  // The title and a short id, never the record path: its file name carries the
  // machine name and the path the home folder, and this line reaches the user.
  console.log(`Saved handover "${title}" (id ${short}).`);
  for (const r of replaced) console.log(`Archived the older handover it replaces: "${r.title}" (id ${r.short}).`);
  if (normalisePath(startedIn) !== normalisePath(process.cwd()))
    console.log(`Filed against the session root ${tildePath(normalisePath(startedIn))}, not the current directory.`);
  // A handover nobody can find is worse than none: the session is told to /clear
  // and starts empty with nothing saying a handover exists. So prove the record
  // comes back through the lookup the SessionStart hook uses (by this checkout's
  // repo key) before promising anything. This is cheap - the store is small - and
  // it is the only thing standing between a bad save and a lost session. It used
  // to look it up by path from the main checkout, which also matches a worktree's
  // handovers, so a save in a worktree promised a load there that never came
  // (docs check, 2026-09-27).
  const found = listWaiting(storeRoot(), repoKey(top)).some((h) => h.id === id);
  if (top !== main) console.log(`Written in the worktree ${tildePath(top)}: it loads in a session started there, not in ${tildePath(main)}.`);
  if (webEnabled() || process.argv.includes("--commit")) {
    const { top, branch } = repoInfo(startedIn);
    const r = commitHandover(top, path, branch);
    if (r.pushed) console.log(`Pushed to ${r.ref} (your branch is untouched), so a new cloud session can list it.`);
    else console.log(`Could not push the handover to ${r.ref} (${r.error}). A new cloud session will not see it.`);
  }
  if (found && auto?.window) {
    console.log("The clear-resume extension opens a new conversation from it in this window. End your turn; the user does not need to type /clear.");
  } else if (found && auto) {
    console.log("The runner resumes from it in a fresh session once this one ends. Commit anything left, then end your turn.");
  } else if (found) {
    console.log(`After /clear, the next session in ${tildePath(top)} loads it automatically.`);
  } else {
    console.error(
      `clear-resume: WARNING - the handover saved but is NOT discoverable from ${tildePath(top)}, ` +
        `so /clear would start an empty session. Do not tell the user to clear. ` +
        `Load it by hand instead: node ${shellPath(fileURLToPath(new URL("load.mjs", import.meta.url)))} ${short} ` +
        `(the record is ${tildePath(path)}).`,
    );
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`clear-resume: ${err.message}`);
  process.exit(1);
}
