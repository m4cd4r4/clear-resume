// Decision logic for the post-merge/post-rewrite git hooks that keep the
// INSTALLED plugin copy in step with this repo after a pull.
//
// Claude Code installs a copy of the plugin under
// ~/.claude/plugins/cache/clear-resume/clear-resume/<version>/, resolved from a
// "directory" marketplace entry that points at this repo. A merge here changes
// nothing about that copy until `claude plugin marketplace update clear-resume`
// and `claude plugin update clear-resume@clear-resume` both run. Nobody
// remembered to run them by hand (the installed copy sat three fixes behind
// from 2026-09-20 to 2026-09-25, and again on 2026-09-27) so the hook runs them
// automatically, but only when all of the following hold:
//
//   - the branch just updated is main (a feature branch is not what is installed)
//   - this checkout is the PRIMARY one, never a linked worktree (running the
//     update from a worktree would still point at the same install, but doing
//     it once, from the one checkout meant for it, keeps the failure mode
//     obvious rather than triggering it from N places)
//   - the pull actually touched a path the plugin ships (skip a docs-only pull)
//
// This module holds the pure decision only - no git, no child_process, no I/O -
// so it can be unit tested without a real repo or a real `claude` binary. See
// scripts/auto-update-on-pull.mjs for the CLI that gathers the real inputs and
// scripts/lib/auto-update-run.mjs for the part that shells out.

/**
 * Path prefixes (relative to the repo root) that make up the shipped plugin: the
 * plugin/ folder the marketplace entry points at, and the marketplace file itself.
 * The root scripts/ folder is dev tooling (this hook, the drill) and ships nothing.
 */
export const PLUGIN_PATH_PREFIXES = ["plugin/", ".claude-plugin/"];

/**
 * Paths (relative, forward-slashed, as `git diff --name-only` prints them)
 * that fall under one of `prefixes`.
 */
export function pluginPathsChanged(changedPaths, prefixes = PLUGIN_PATH_PREFIXES) {
  return (changedPaths ?? []).filter((p) => prefixes.some((prefix) => p.startsWith(prefix)));
}

/**
 * Whether the auto-update should run, and why (or why not) - always populated,
 * so the hook has a one-line answer to print either way.
 *
 * @param {object} input
 * @param {string} input.branch - current branch name, "" if detached/unknown.
 * @param {boolean} input.isPrimaryCheckout - false for any linked worktree.
 * @param {string[]|null} input.changedPaths - paths touched by the pull
 *   (`git diff --name-only ORIG_HEAD..HEAD`), or null when there was no
 *   previous HEAD to diff against (nothing was actually pulled).
 * @param {string[]} [input.pathPrefixes] - override for testing.
 */
export function decideAutoUpdate({ branch, isPrimaryCheckout, changedPaths, pathPrefixes = PLUGIN_PATH_PREFIXES }) {
  if (branch !== "main") {
    return { run: false, reason: `on branch "${branch || "(unknown)"}", not main` };
  }
  if (!isPrimaryCheckout) {
    return { run: false, reason: "this is a linked worktree, not the primary checkout" };
  }
  if (changedPaths == null) {
    return { run: false, reason: "no previous HEAD to diff (nothing was pulled)" };
  }
  const touched = pluginPathsChanged(changedPaths, pathPrefixes);
  if (touched.length === 0) {
    return { run: false, reason: "the pull did not touch any plugin files" };
  }
  const shown = touched.slice(0, 3).join(", ") + (touched.length > 3 ? `, +${touched.length - 3} more` : "");
  return { run: true, reason: `plugin files changed: ${shown}` };
}
