// Orchestration for the post-merge/post-rewrite hooks: gathers the real git
// state, asks decideAutoUpdate() what to do, runs the update if told to, and
// logs exactly one line either way.
//
// Kept apart from the thin scripts/auto-update-on-pull.mjs CLI (which only
// calls runHook() and swallows anything unexpected) so this can be imported
// and tested directly, the same way scripts/lib/hook.mjs's run() is tested
// instead of the session-start.mjs entry point that calls it.
import { execFileSync } from "node:child_process";
import { repoInfo } from "./store.mjs";
import { mainWorktree, worktreePaths } from "../../packages/store/worktree.mjs";
import { decideAutoUpdate } from "./auto-update.mjs";
import { runPluginUpdate } from "./auto-update-run.mjs";

function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** Paths changed since before the pull, or null when there is nothing to diff. */
function changedSincePull(cwd, { git: gitFn = git } = {}) {
  const origHead = gitFn(cwd, ["rev-parse", "-q", "--verify", "ORIG_HEAD"]);
  if (!origHead) return null;
  const out = gitFn(cwd, ["diff", "--name-only", `${origHead}..HEAD`]);
  return out === null ? [] : out.split("\n").filter(Boolean);
}

/**
 * Runs the hook end to end. Never throws: every git call fails soft (via the
 * local `git()` helper above) and runPluginUpdate() reports its own errors
 * rather than raising them, so there is nothing left here that can escape.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.argv] - defaults to process.argv; argv[2] is the
 *   hook name ("post-merge" | "post-rewrite"), argv[3] its shell argument.
 * @param {string} [opts.cwd] - defaults to process.cwd().
 * @param {(line: string) => void} [opts.log] - defaults to console.log.
 * @param {typeof runPluginUpdate} [opts.update] - injected for tests.
 */
export function runHook({ argv = process.argv, cwd = process.cwd(), log = console.log, update = runPluginUpdate } = {}) {
  const hookName = argv[2] || "post-merge";
  const hookArg = argv[3] ?? "";

  // post-rewrite also fires for `git commit --amend`; only a rebase is a pull.
  if (hookName === "post-rewrite" && hookArg !== "rebase") {
    log(`clear-resume auto-update: skipped (post-rewrite reason "${hookArg || "amend"}", not a rebase)`);
    return;
  }

  const { top, branch } = repoInfo(cwd);
  const isPrimaryCheckout = worktreePaths(top)[0] === mainWorktree(top);
  const changedPaths = changedSincePull(top);

  const decision = decideAutoUpdate({ branch, isPrimaryCheckout, changedPaths });
  if (!decision.run) {
    log(`clear-resume auto-update: skipped (${decision.reason})`);
    return;
  }

  const result = update();
  log(
    result.ok
      ? `clear-resume auto-update: ran \`claude plugin marketplace update\` + \`claude plugin update\` (${decision.reason})`
      : `clear-resume auto-update: attempted the update but hit an error - ${result.detail}`,
  );
}
