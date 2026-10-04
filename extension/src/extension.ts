import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { archiveRecord, listAll, prune, remove, setPinned, storeRoot, type StoredHandover } from "../../plugin/packages/store/store.mjs";
import { migrate } from "../../plugin/packages/store/migrate.mjs";
import { pushIfSynced } from "../../plugin/packages/store/sync.mjs";
import { loadedCopyPath } from "../../plugin/packages/store/loaded.mjs";
import { loadedInFolders, statusText } from "../../plugin/packages/store/view.mjs";
import { worktreePaths } from "../../plugin/packages/store/worktree.mjs";
import { HistoryProvider, type HandoverNode } from "./tree";
import { LanesProvider } from "./lanes-tree";
import { statsStatus } from "./stats-status";
import { ownedByThisWindow } from "./window-owner";

const VIEW = "clearResume.history";
const LANES_VIEW = "clearResume.lanes";
const CLAUDE_OPEN = "claude-vscode.editor.open";

/**
 * Run a store mutation and send it to the other machine.
 *
 * The sidebar writes to the same store the hooks do, so it owes the same push. A
 * pin or a delete that stays local is not a slower sync, it is a change the other
 * machine will undo: it still holds the record, so its next push restores it.
 * Failing to push must never break the command - the next save picks the change up.
 */
/** The extension's own copy of the sync CLI (dist/sync.js), set on activate. */
let syncCli: string | undefined;

function pushed<T>(root: string, mutate: () => T): T {
  const result = mutate();
  try {
    pushIfSynced(root, process.env, syncCli);
  } catch {
    // Offline, mid-rebase, no remote. All normal; the change is on disk.
  }
  return result;
}

export function activate(context: vscode.ExtensionContext): void {
  syncCli = context.asAbsolutePath(join("dist", "sync.js"));
  const config = () => vscode.workspace.getConfiguration("clearResume");
  const root = () => config().get<string>("storePath")?.trim() || storeRoot();
  const showArchived = () => config().get<boolean>("showArchived") === true;

  // Only the owner's original setup has anything to import. Everyone else gets no
  // welcome link and no command-palette entry for a migration that would find
  // nothing - the context key drives both `when` clauses in package.json.
  void vscode.commands.executeCommand("setContext", "clearResume.hasLegacy", hasLegacyNotes());

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

  const registry = () => config().get<string>("registryPath")?.trim() ?? "";
  const lanesProvider = new LanesProvider(root, registry);
  const lanesTree = vscode.window.createTreeView(LANES_VIEW, { treeDataProvider: lanesProvider, showCollapseAll: true });
  context.subscriptions.push(lanesTree);

  const status = loadedStatus(context, root);
  statsStatus(context, () => {
    const record = status.current();
    if (record) void openLoaded(record, root());
    else void vscode.window.showInformationMessage("clear-resume: no handover loaded in this window in the last day.");
  });
  watchStore(context, root, () => {
    provider.refresh();
    lanesProvider.refresh();
    status.update();
  });
  // "loaded 3h ago" has to stay true with nothing written to the store.
  const minute = setInterval(() => {
    status.update();
    if (tree.visible) provider.refresh();
    // Worktrees come and go without a store write, so this view re-reads git.
    if (lanesTree.visible) lanesProvider.refresh();
  }, 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(minute) });

  context.subscriptions.push(
    vscode.commands.registerCommand("clearResume.refresh", () => {
      provider.refresh();
      lanesProvider.refresh();
    }),

    // A worktree row opens its window: the minting script's .code-workspace when
    // there is one (it keeps the title and colour), else the folder.
    vscode.commands.registerCommand("clearResume.openLane", (target?: string) => {
      if (target) void vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(target), { forceNewWindow: true });
    }),

    vscode.commands.registerCommand("clearResume.openLoaded", (record?: StoredHandover) => openLoaded(record, root())),

    vscode.commands.registerCommand("clearResume.toggleArchived", async () => {
      await config().update("showArchived", !showArchived(), vscode.ConfigurationTarget.Global);
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.open", async (node?: HandoverNode) => {
      if (node?.record) await openBody(node.record);
    }),

    vscode.commands.registerCommand("clearResume.resume", async (node?: HandoverNode) => {
      const record = node?.record;
      if (!record) return;
      await resume(record, root());
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.pin", (node?: HandoverNode) => {
      if (!node) return;
      pushed(root(), () => setPinned(node.record.id, true, { root: root() }));
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.unpin", (node?: HandoverNode) => {
      if (!node) return;
      pushed(root(), () => setPinned(node.record.id, false, { root: root() }));
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
      pushed(root(), () => remove(node.record.id, { root: root() }));
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.migrate", () => runMigration(root(), () => provider.refresh())),
  );
}

export function deactivate(): void {}

/** A handover's body in an untitled markdown editor. */
async function openBody(record: StoredHandover): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ content: record.body, language: "markdown" });
  await vscode.window.showTextDocument(doc, { preview: true });
}

/**
 * Open the readable copy the plugin wrote when it loaded this handover, a real
 * file the user can copy the path of or @-mention. The copy lives only on the
 * machine that loaded it and is pruned after 30 days, so without it the body
 * opens as before.
 */
async function openLoaded(record: StoredHandover | undefined, root: string): Promise<void> {
  if (!record) return;
  const copy = loadedCopyPath(root, record);
  if (existsSync(copy)) {
    await vscode.window.showTextDocument(vscode.Uri.file(copy), { preview: true });
    return;
  }
  await openBody(record);
}

/**
 * The status-bar item: `Handover: <title> (loaded 3h ago)` for the newest handover
 * loaded in the last day in any open workspace folder, hidden when there is none. Clicking it
 * opens the same readable copy as the Loaded group.
 */
function loadedStatus(context: vscode.ExtensionContext, root: () => string): { update: () => void; current: () => StoredHandover | null } {
  const item = vscode.window.createStatusBarItem("clearResume.loaded", vscode.StatusBarAlignment.Left, 0);
  item.name = "clear-resume: loaded handover";
  context.subscriptions.push(item);
  let current: StoredHandover | null = null;
  // Two windows on one repo each name the load their own session made.
  const owned = ownedByThisWindow(() => update());

  const update = () => {
    try {
      // Every workspace folder, not only the first: in a multi-root workspace the
      // handover may have been loaded in any of them.
      const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath).filter(Boolean);
      const now = new Date();
      const record = folders.length
        ? loadedInFolders(listAll(root()), folders.map((repoPath) => ({ repoPath, roots: worktreePaths(repoPath) })), { now, owned })
        : null;
      current = record;
      if (!record) {
        item.hide();
        return;
      }
      item.text = statusText(record, now);
      item.tooltip = "Open the handover this repo loaded";
      item.command = { command: "clearResume.openLoaded", title: "Open loaded handover", arguments: [record] };
      item.show();
    } catch {
      // A status-bar item must never break the extension.
      item.hide();
    }
  };

  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(update));
  update();
  return { update, current: () => current };
}

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
  // The extension host is not a Claude window, so there is no owner to record.
  pushed(root, () => archiveRecord(record.id, { root, by: { owner: "", pid: String(process.pid), via: "extension" } }));
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

/** The old flow's prompt folder. Only ever populated on the machine that ran it. */
function legacyNotesDir(): string {
  return join(homedir(), "Notes", "resume");
}

/** True only for the one setup that has anything to import: a `.txt` prompt file
 * sitting in the legacy folder. Everyone else gets neither the welcome link nor the
 * command-palette entry for a migration that would find nothing to do. */
function hasLegacyNotes(): boolean {
  const dir = legacyNotesDir();
  try {
    return existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(".txt"));
  } catch {
    return false;
  }
}

async function runMigration(root: string, onDone: () => void): Promise<void> {
  const notesDir = legacyNotesDir();
  const report = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Importing handovers" },
    async () => pushed(root, () => migrate({ notesDir, root, machine: "legacy" })),
  );

  onDone();
  const parts = [`${report.imported} imported`];
  if (report.alreadyPresent) parts.push(`${report.alreadyPresent} already there`);
  if (report.missingBody) parts.push(`${report.missingBody} without a body file`);
  if (report.unparsed.length) parts.push(`${report.unparsed.length} unrecognised`);
  vscode.window.showInformationMessage(`${parts.join(", ")}. Originals were left where they are.`);
}
