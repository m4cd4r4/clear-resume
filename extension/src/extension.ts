import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { archiveRecord, listAll, prune, read, remove, setPinned, storeRoot, type StoredHandover } from "../../plugin/packages/store/store.mjs";
import { archiveMerged } from "../../plugin/packages/store/merged.mjs";
import { migrate } from "../../plugin/packages/store/migrate.mjs";
import { pushIfSynced } from "../../plugin/packages/store/sync.mjs";
import { loadedCopyPath } from "../../plugin/packages/store/loaded.mjs";
import { captureDir, pruneCaptures, readCapture } from "../../plugin/packages/store/artifacts.mjs";
import { LAST_SCREEN, ALL_ASSETS } from "./sidebar-model";
import { loadedInFolders } from "../../plugin/packages/store/view.mjs";
import { worktreePaths } from "../../plugin/packages/store/worktree.mjs";
import { SidebarProvider } from "./sidebar";
import { spareStatus } from "./spare-status";
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

  const registry = () => config().get<string>("registryPath")?.trim() ?? "";
  // The page asks; each ask runs the command the tree row's button used to run.
  const act = (m: { type: string; id?: string; target?: string; n?: number }) => {
    if (m.type === "migrate") void vscode.commands.executeCommand("clearResume.migrate");
    else if (m.type === "openLane") void vscode.commands.executeCommand("clearResume.openLane", m.target);
    else if (m.id) void vscode.commands.executeCommand(`clearResume.${m.type}`, { id: m.id, n: m.n });
  };
  const provider = new SidebarProvider("handovers", root, showArchived, registry, hasLegacyNotes, act);
  const lanesProvider = new SidebarProvider("lanes", root, showArchived, registry, hasLegacyNotes, act);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW, provider),
    vscode.window.registerWebviewViewProvider(LANES_VIEW, lanesProvider),
  );

  // Delete archived records past their window once per activation. Cheap, and it
  // keeps the tree from growing without anyone having to remember to tidy it.
  try {
    prune({ root: root() });
    pruneCaptures({ root: root(), keep: new Set(listAll(root()).filter((r) => r.status === "waiting").map((r) => String(r.sessionId ?? "")).filter(Boolean)) });
  } catch {
    // A prune failure must never stop the view from opening.
  }

  // Archive waiting handovers whose branch has shipped. It asks GitHub, so it runs
  // after activation returns and never holds the view up; a failure leaves them waiting.
  void archiveMerged({ root: root() })
    .then((done) => {
      if (done.length) {
        provider.refresh();
        lanesProvider.refresh();
      }
    })
    .catch(() => undefined);

  statsStatus(context, loadedLookup(root), (record) => {
    if (record) void openLoaded(record, root());
    else void vscode.window.showInformationMessage("clear-resume: no handover loaded in this tab in the last day.");
  });
  spareStatus(context);
  watchStore(context, root, () => {
    provider.refresh();
    lanesProvider.refresh();
  });
  const minute = setInterval(() => {
    if (provider.visible) provider.refresh();
    // Worktrees come and go without a store write, so this view re-reads git.
    if (lanesProvider.visible) lanesProvider.refresh();
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

    vscode.commands.registerCommand("clearResume.openLoaded", (arg?: Target) => openLoaded(recordOf(arg, root()), root())),

    vscode.commands.registerCommand("clearResume.asset", (arg?: Target & { n?: number }) => openAsset(recordOf(arg, root()), arg?.n, root())),

    vscode.commands.registerCommand("clearResume.toggleArchived", async () => {
      await config().update("showArchived", !showArchived(), vscode.ConfigurationTarget.Global);
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.open", async (arg?: Target) => {
      const record = recordOf(arg, root());
      if (record) await openBody(record);
    }),

    vscode.commands.registerCommand("clearResume.resume", async (arg?: Target) => {
      const record = recordOf(arg, root());
      if (!record) return;
      await resume(record, root());
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.pin", (arg?: Target) => {
      const record = recordOf(arg, root());
      if (!record) return;
      pushed(root(), () => setPinned(record.id, true, { root: root() }));
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.unpin", (arg?: Target) => {
      const record = recordOf(arg, root());
      if (!record) return;
      pushed(root(), () => setPinned(record.id, false, { root: root() }));
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.delete", async (arg?: Target) => {
      const record = recordOf(arg, root());
      if (!record) return;
      const yes = await vscode.window.showWarningMessage(
        `Delete "${record.title}"?`,
        { modal: true, detail: "The handover disappears from this list. A record of the delete is kept for 90 days so it cannot come back from another machine, then it goes for good. Any original file it was imported from is left alone." },
        "Delete",
      );
      if (yes !== "Delete") return;
      pushed(root(), () => remove(record.id, { root: root() }));
      provider.refresh();
    }),

    vscode.commands.registerCommand("clearResume.migrate", () => runMigration(root(), () => provider.refresh())),
  );
}

export function deactivate(): void {}

/** What a handover command is handed: a record, a tree-style node, or the `{ id }` the sidebar page and its context menu send. */
type Target = StoredHandover | { record?: StoredHandover; id?: string };

function recordOf(arg: Target | undefined, root: string): StoredHandover | undefined {
  const node = arg as { record?: StoredHandover; id?: string; title?: string } | undefined;
  if (node?.record) return node.record;
  if (node?.title && node.id) return node as StoredHandover;
  if (!node?.id) return undefined;
  try {
    return read(node.id, root);
  } catch {
    return undefined;
  }
}

/** A handover's body in an untitled markdown editor. */
async function openBody(record: StoredHandover): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ content: record.body, language: "markdown" });
  await vscode.window.showTextDocument(doc, { preview: true });
}

/**
 * Open one asset a handover's session left on screen. The page sends only the handover's id and an
 * index; what that index names is read from the capture here, so a page cannot ask for a path or a URL
 * of its own. A link opens in the browser, a path in the editor (copied when it is not on this machine),
 * a table or list in an untitled markdown editor, the last screen and the full list as their files.
 */
async function openAsset(record: StoredHandover | undefined, n: number | undefined, root: string): Promise<void> {
  const capture = typeof record?.sessionId === "string" ? readCapture(root, record.sessionId) : null;
  if (!record || !capture || n === undefined) return;
  const dir = captureDir(root, capture.sessionId);
  const file = (name: string) => vscode.window.showTextDocument(vscode.Uri.file(join(dir, name)), { preview: true });
  if (n === LAST_SCREEN) return void (await file("last-screen.md"));
  if (n === ALL_ASSETS) return void (await file("artifacts.md"));
  const item = capture.items[n];
  if (!item) return;
  if (item.kind === "link") {
    if (/^https?:\/\//i.test(item.text)) await vscode.env.openExternal(vscode.Uri.parse(item.text));
  } else if (item.kind === "path") {
    const path = item.text.startsWith("~/") ? join(homedir(), item.text.slice(2)) : item.text;
    if (existsSync(path)) await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(path));
    else {
      await vscode.env.clipboard.writeText(item.text);
      void vscode.window.showInformationMessage(`clear-resume: ${item.text} is not on this machine; the path is copied.`);
    }
  } else {
    const doc = await vscode.workspace.openTextDocument({ content: `# ${item.title}\n\n${item.text}\n`, language: "markdown" });
    await vscode.window.showTextDocument(doc, { preview: true });
  }
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
 * The handover a Claude tab loaded, for the pie's hover card: the newest one loaded
 * in the last day in any open workspace folder by the Claude process `pid`, or, with
 * no tab to go by (null), by this window. Two tabs in one window are two processes,
 * so each names its own load; a handover loaded by a parallel session never shows.
 * The store and git are read at most every 30 seconds per pid, not on every poll.
 */
function loadedLookup(root: () => string): (pid: string | null) => StoredHandover | null {
  const windowOwned = ownedByThisWindow(() => {});
  const cache = new Map<string, { at: number; record: StoredHandover | null }>();
  return (pid) => {
    const key = pid ?? "";
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 30_000) return hit.record;
    let record: StoredHandover | null = null;
    try {
      // Every workspace folder, not only the first: in a multi-root workspace the
      // handover may have been loaded in any of them.
      const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath).filter(Boolean);
      const owned = pid ? (r: StoredHandover) => String(r.archivedBy?.owner ?? "").split("@")[0] === pid : windowOwned;
      record = folders.length
        ? loadedInFolders(listAll(root()), folders.map((repoPath) => ({ repoPath, roots: worktreePaths(repoPath) })), { now: new Date(), owned })
        : null;
    } catch {
      // The hover card must never break the extension.
    }
    cache.set(key, { at: Date.now(), record });
    return record;
  };
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
