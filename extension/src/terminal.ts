/**
 * Terminal mode (docs/AUTO-CONTINUE.md, "Phase 2b"): the decisions behind
 * continuing a session in a terminal the extension opens. A positional prompt
 * makes the CLI submit at once, so no keypress is needed.
 *
 * Kept free of the vscode import so it can be unit-tested.
 */

export type Surface = "panel" | "terminal";
export type Mode = "same" | Surface;

/**
 * Where a continue opens. The setting `clearResume.autoContinue.mode` overrides;
 * its default, "same", follows the surface the session ran on, as stamped in the
 * record. A record saved before the stamp existed reads as panel.
 */
export function continueSurface(mode: Mode | undefined, record: { surface?: string }): Surface {
  if (mode === "panel" || mode === "terminal") return mode;
  return record.surface === "terminal" ? "terminal" : "panel";
}

/**
 * The terminal to close after a continue, or null. Each terminal the extension
 * opens carries an id in CLEAR_RESUME_TERMINAL, which the plugin stamps on the
 * handover its session saves. So the old session's terminal is named exactly; a
 * record without the id (a panel, or the user's own terminal) closes nothing.
 */
export function terminalToClose<T>(opened: ReadonlyMap<string, T>, record: { terminal?: string }): T | null {
  return (record.terminal && opened.get(record.terminal)) || null;
}

/**
 * Whether a path can go inside the double quotes of the launch line in any of
 * pwsh, cmd and bash. A path that fails falls back to panel mode for that
 * continue, rather than quoting per shell.
 */
export function safeForShell(path: string): boolean {
  return !/["$`%^&|<>!]/.test(path);
}

/**
 * The env for a terminal the extension opens. The ids let the session's hooks
 * see this window and name this terminal. The rest unset (null) the markers that
 * make the CLI think it is a nested session, which turns its transcript off, and
 * with it the nudge. They are the ones Claude Code's own extension deletes before
 * it starts the CLI; where the terminal inherited one is in findings-terminal-mode.md.
 */
export function terminalEnv(window: string, terminal: string): Record<string, string | null> {
  return {
    CLEAR_RESUME_WINDOW: window,
    CLEAR_RESUME_TERMINAL: terminal,
    CLAUDECODE: null,
    CLAUDE_CODE_CHILD_SESSION: null,
    TRACEPARENT: null,
    TRACESTATE: null,
  };
}

/**
 * Whether the CLI will start in `repoPath` without its "trust this folder?"
 * prompt, given the parsed ~/.claude.json. A terminal session that prompts sits
 * unseen until someone opens the terminal (findings-terminal-mode.md). Mirrors the
 * CLI's check (2.1.286): exact key, no parent walk, no case folding. Erring
 * towards untrusted only costs a panel continue; erring the other way hangs.
 */
export function cliTrusts(claudeJson: unknown, repoPath: string): boolean {
  const projects = (claudeJson as { projects?: Record<string, { hasTrustDialogAccepted?: unknown }> } | null)?.projects;
  return projects?.[repoPath.replace(/\\/g, "/")]?.hasTrustDialogAccepted === true;
}

/**
 * The one line sent to the terminal. The handover itself is multi-line, which
 * cmd cannot carry in an argument, so the prompt points at a file instead.
 */
export function launchLine(path: string): string {
  return `claude "Continue from the clear-resume handover in ${path}. Read it in full first, then do its Next action."`;
}
