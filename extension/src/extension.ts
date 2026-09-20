import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { archiveRecord, prune, remove, setPinned, storeRoot, type StoredHandover } from "../../packages/store/store.mjs";
import { migrate } from "../../packages/store/migrate.mjs";
import { HistoryProvider, type HandoverNode } from "./tree";

const VIEW = "clearResume.history";
const CLAUDE_OPEN = "claude-vscode.editor.open";

export function activate(context: vscode.ExtensionContext): void {
  const config = () => vscode.workspace.getConfiguration("clearResume");
  const root = () => config().get<string>("storePath")?.trim() || storeRoot();
  const showArchived = () => config().get<boolean>("showArchived") === true;

  const provider = new HistoryProvider(root, showArchived);
  const tree = vscode.window.createTreeView(VIEW, { treeDataProvider: provider, showCollapseAll: true });
  context.subscriptions.push(tree, provider.onDidChangeTreeData(() => undefined));

  // Delete archived records past their window once per activation. Cheap, and it
  // keeps the tree from growing without anyone having to remember to tidy it.
  try {
    prune({ root: root() });
  } catch {
    // A prune failure must never stop the view from opening.
  }

  watchStore(context, root, () => provider.refresh());

  context.subscriptions.push(
    vscode.commands.registerCommand("clearResume.refresh", () => provider.refresh()),

    vscode.commands.registerCommand("clearResume.toggleArchived", async () => {
      await config().update("showArchived", !showArchived(), vscode.ConfigurationTarget.Global);
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.open", async (node?: HandoverNode) => {
      const record = node?.record;
      if (!record) return;
      const doc = await vscode.workspace.openTextDocument({ content: record.body, language: "markdown" });
      await vscode.window.showTextDocument(doc, { preview: true });
    }),

    vscode.commands.registerCommand("clearResume.resume", async (node?: HandoverNode) => {
      const record = node?.record;
      if (!record) return;
      await resume(record, root());
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.pin", (node?: HandoverNode) => {
      if (!node) return;
      setPinned(node.record.id, true, { root: root() });
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.unpin", (node?: HandoverNode) => {
      if (!node) return;
      setPinned(node.record.id, false, { root: root() });
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.delete", async (node?: HandoverNode) => {
      if (!node) return;
      const yes = await vscode.window.showWarningMessage(
        `Delete "${node.record.title}"?`,
        { modal: true, detail: "The handover disappears from this list. A record of the delete is kept for 90 days so it cannot come back from another machine, then it goes for good. Any original file it was imported from is left alone." },
        "Delete",
      );
      if (yes !== "Delete") return;
      remove(node.record.id, { root: root() });
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.migrate", () => runMigration(root(), () => provider.refresh())),
  );
}

export function deactivate(): void {}

/**
 * Open a new Claude Code conversation with the handover's prompt pre-filled, then
 * archive the record so the same handover cannot be loaded twice.
 *
 * The command is called in-process. The `vscode://anthropic.claude-code/open` URI
 * reaches the same code but shows a confirmation dialog and, on Windows, routes to
 * an arbitrary window - during the spike it landed in an unrelated workspace.
 */
async function resume(record: StoredHandover, root: string): Promise<void> {
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
    return;
  }
  archiveRecord(record.id, { root });
}

/**
 * Watch the store for writes from anywhere - another window, the plugin's hooks, a
 * future sync. A plain string glob does NOT fire for paths outside the workspace,
 * so the pattern must be built from a Uri.
 */
function watchStore(context: vscode.ExtensionContext, root: () => string, onChange: () => void): void {
  let watcher: vscode.FileSystemWatcher | undefined;

  const attach = () => {
    watcher?.dispose();
    const dir = vscode.Uri.file(join(root(), "handovers"));
    watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(dir, "*.json"));
    watcher.onDidCreate(onChange);
    watcher.onDidChange(onChange);
    watcher.onDidDelete(onChange);
    context.subscriptions.push(watcher);
  };

  attach();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("clearResume.storePath")) return;
      attach();
      onChange();
    }),
    { dispose: () => watcher?.dispose() },
  );
}

async function runMigration(root: string, onDone: () => void): Promise<void> {
  const notesDir = join(homedir(), "Notes", "resume");
  const report = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Importing handovers" },
    async () => migrate({ notesDir, root, machine: "legacy" }),
  );

  onDone();
  const parts = [`${report.imported} imported`];
  if (report.alreadyPresent) parts.push(`${report.alreadyPresent} already there`);
  if (report.missingBody) parts.push(`${report.missingBody} without a body file`);
  if (report.unparsed.length) parts.push(`${report.unparsed.length} unrecognised`);
  vscode.window.showInformationMessage(`${parts.join(", ")}. Originals were left where they are.`);
}
