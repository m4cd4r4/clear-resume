/**
 * The Claude Code tab to close after an auto-continue, or null.
 *
 * Every Claude Code tab is labelled "Claude Code" and carries no session id
 * (probe, 2026-10-01, Claude Code 2.1.285), so the old session's tab can only be
 * named when it was the one Claude tab in the window and the continue added
 * exactly one beside it. Anything else closes nothing: a wrong guess would close
 * a live session.
 *
 * Kept free of the vscode import so it can be unit-tested.
 */
export function oldTabToClose<T>(before: readonly T[], after: readonly T[]): T | null {
  if (before.length !== 1 || after.length !== 2) return null;
  return after.includes(before[0]) ? before[0] : null;
}
