import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { launchLine, terminalEnv, terminalToClose } from "./terminal";

/**
 * Terminal mode's vscode side (docs/AUTO-CONTINUE.md, "Phase 2b"). The decisions
 * are in terminal.ts; this file only opens and closes terminals.
 */

/**
 * Terminals this extension opened, by the CLEAR_RESUME_TERMINAL id each carries.
 * The plugin stamps that id on the handover the session in it saves, so the old
 * terminal is closed by name. A window reload forgets the map, and a terminal it
 * forgot is left open rather than guessed at.
 */
const opened = new Map<string, vscode.Terminal>();

/**
 * Start the next session in a new terminal: `claude "<one line>"`, which the CLI
 * submits at once. The terminal carries the window key, so the session's hooks
 * see this window although their parent is a shell.
 */
export function openSessionTerminal(opts: { cwd: string; window: string; path: string; title: string }): void {
  const id = randomUUID();
  const terminal = vscode.window.createTerminal({
    name: `clear-resume: ${opts.title}`.slice(0, 60),
    cwd: opts.cwd,
    env: terminalEnv(opts.window, id),
  });
  opened.set(id, terminal);
  terminal.show();
  terminal.sendText(launchLine(opts.path));
}

/** Close the terminal the record's session ran in, when this extension opened it. */
export function closeOldTerminal(record: { terminal?: string }): void {
  const old = terminalToClose(opened, record);
  if (!old || !record.terminal) return;
  opened.delete(record.terminal);
  old.dispose();
}
