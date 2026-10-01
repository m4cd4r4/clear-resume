/**
 * Terminal mode (docs/AUTO-CONTINUE.md, "Phase 2b"): the decisions behind
 * continuing a session in a terminal the extension opens. A positional prompt
 * makes the CLI submit at once, so no keypress is needed.
 *
 * Kept free of the vscode import so it can be unit-tested.
 */

/**
 * The one line sent to the terminal. The handover itself is multi-line, which
 * cmd cannot carry in an argument, so the prompt points at a file instead.
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

export function launchLine(path: string): string {
  return `claude "Continue from the clear-resume handover in ${path}. Read it in full first, then do its Next action."`;
}
