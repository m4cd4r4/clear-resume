/** Absolute paths of every worktree of the repo at `dir`, including `dir` itself. */
export function worktreePaths(dir?: string): string[];
/** Drop the memo. Called when the worktree list could have changed under us. */
export function forgetWorktrees(): void;
