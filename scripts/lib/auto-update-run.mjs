// The side-effecting half of the auto-update hook: actually shells out to
// `claude`. Kept apart from auto-update.mjs so the decision logic can be
// tested with no real process spawn, and this file's own tests stub `run`
// rather than calling the real `claude` binary.
import { execFileSync } from "node:child_process";

const STEPS = [
  ["claude", ["plugin", "marketplace", "update", "clear-resume"]],
  ["claude", ["plugin", "update", "clear-resume@clear-resume"]],
];

function defaultRun(cmd, args) {
  // shell: true resolves claude.cmd on Windows and claude on everything else
  // from PATH the same way a typed command would.
  execFileSync(cmd, args, { stdio: "ignore", shell: true, timeout: 60_000 });
}

/**
 * Runs the two commands that bring the installed plugin copy up to date.
 * Never throws: a missing `claude`, a network hiccup in the marketplace
 * fetch, or any other failure is caught and reported in the result instead,
 * because this runs from a git hook that must not fail the pull.
 *
 * @param {object} [opts]
 * @param {(cmd: string, args: string[]) => void} [opts.run] - injected for tests.
 */
export function runPluginUpdate({ run = defaultRun } = {}) {
  const errors = [];
  for (const [cmd, args] of STEPS) {
    try {
      run(cmd, args);
    } catch (err) {
      errors.push(`${cmd} ${args.join(" ")}: ${err && err.message ? err.message : err}`);
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, detail: errors.join("; ") };
}
