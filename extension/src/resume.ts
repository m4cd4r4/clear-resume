import * as vscode from "vscode";
import { archiveRecord, type StoredHandover } from "../../plugin/packages/store/store.mjs";
import { pushIfSynced } from "../../plugin/packages/store/sync.mjs";

const CLAUDE_OPEN = "claude-vscode.editor.open";

/** The extension's own copy of the sync CLI (dist/sync.js), set on activate. */
let syncCli: string | undefined;

export function setSyncCli(path: string): void {
  syncCli = path;
}

/**
 * Run a store mutation and send it to the other machine.
 *
 * The sidebar writes to the same store the hooks do, so it owes the same push. A
 * pin or a delete that stays local is not a slower sync, it is a change the other
 * machine will undo: it still holds the record, so its next push restores it.
 * Failing to push must never break the command - the next save picks the change up.
 */
export function pushed<T>(root: string, mutate: () => T): T {
  const result = mutate();
  try {
    pushIfSynced(root, process.env, syncCli);
  } catch {
    // Offline, mid-rebase, no remote. All normal; the change is on disk.
  }
  return result;
}

/**
 * Open a new Claude Code conversation with the handover's prompt pre-filled, then
 * archive the record so the same handover cannot be loaded twice.
 *
 * The command is called in-process. The `vscode://anthropic.claude-code/open` URI
 * reaches the same code but shows a confirmation dialog and, on Windows, routes to
 * an arbitrary window - during the spike it landed in an unrelated workspace.
 */
export async function resume(record: StoredHandover, root: string): Promise<boolean> {
  try {
    await vscode.commands.executeCommand(CLAUDE_OPEN, undefined, record.resumePrompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const copy = "Copy prompt";
    const choice = await vscode.window.showErrorMessage(
      `Could not open a Claude Code conversation: ${message}`,
      copy,
    );
    if (choice === copy) await vscode.env.clipboard.writeText(record.resumePrompt);
    // Nothing was resumed, so the record stays waiting.
    return false;
  }
  archived(record, root);
  return true;
}

/** Archive a record the extension opened. The extension host is not a Claude
 * window, so there is no owner to record. */
export function archived(record: StoredHandover, root: string): void {
  pushed(root, () => archiveRecord(record.id, { root, by: { owner: "", pid: String(process.pid), via: "extension" } }));
}
