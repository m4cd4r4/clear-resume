import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { autoContinueFor, budgetFile, budgetLabel, nextBudget, readBudget, setBudget, stalls, takeOne, type HostWindow } from "../../plugin/packages/store/autobudget.mjs";
import { archiveRecord, listAll, prune, remove, setPinned, storeRoot, type StoredHandover } from "../../plugin/packages/store/store.mjs";
import { migrate } from "../../plugin/packages/store/migrate.mjs";
import { GIT_EXE, pushIfSynced } from "../../plugin/packages/store/sync.mjs";
import { loadedCopyPath, writeLoadedCopy } from "../../plugin/packages/store/loaded.mjs";
import { loadedInFolders, statusText } from "../../plugin/packages/store/view.mjs";
import { worktreePaths } from "../../plugin/packages/store/worktree.mjs";
import { oldTabToClose } from "./oldtab";
import { continueSurface, safeForShell, type Mode } from "./terminal";
import { closeOldTerminal, openSessionTerminal } from "./terminals";
import { HistoryProvider, type HandoverNode } from "./tree";
import { LanesProvider } from "./lanes-tree";

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

  // Every terminal in this window carries the window key, so a `claude` the user
  // starts in one can join an auto-continue chain (/clear-resume:auto). Not
  // persisted: a reload gives the window a new key, set here again.
  const win = thisWindow();
  context.environmentVariableCollection.persistent = false;
  context.environmentVariableCollection.replace("CLEAR_RESUME_WINDOW", `${win.pid}@${win.start}`);

  autoStatus(context, root);
  const status = loadedStatus(context, root);
  const continuer = autoContinuer(root, () => provider.refresh());
  watchStore(context, root, () => {
    provider.refresh();
    lanesProvider.refresh();
    status.update();
    continuer();
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
function loadedStatus(context: vscode.ExtensionContext, root: () => string): { update: () => void } {
  const item = vscode.window.createStatusBarItem("clearResume.loaded", vscode.StatusBarAlignment.Left, 0);
  item.name = "clear-resume: loaded handover";
  context.subscriptions.push(item);

  const update = () => {
    try {
      // Every workspace folder, not only the first: in a multi-root workspace the
      // handover may have been loaded in any of them.
      const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath).filter(Boolean);
      const now = new Date();
      const record = folders.length
        ? loadedInFolders(listAll(root()), folders.map((repoPath) => ({ repoPath, roots: worktreePaths(repoPath) })), { now })
        : null;
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
  return { update };
}

/**
 * This window as the plugin's hooks see it: the extension host, which is the
 * parent of every Claude process in the window. The start is estimated from
 * uptime; plain node lands within 15ms of the process table's figure, well inside
 * the 1s slack readBudget allows.
 */
const thisWindow = (): HostWindow => ({ pid: String(process.pid), start: Math.round(Date.now() - process.uptime() * 1000) });

/**
 * The auto-continue status-bar item: `auto: 2 of 4 left`, shown once a budget has
 * been set in this window (by /clear-resume:auto or the command). Clicking it
 * steps off, 3, unlimited.
 */
function autoStatus(context: vscode.ExtensionContext, root: () => string): void {
  const item = vscode.window.createStatusBarItem("clearResume.auto", vscode.StatusBarAlignment.Left, 0);
  item.name = "clear-resume: auto-continue";
  item.command = "clearResume.stepAuto";
  item.tooltip = "Auto-continue in this window: click to step off, 3, unlimited";
  context.subscriptions.push(item);

  const update = () => {
    try {
      const file = budgetFile(root(), thisWindow());
      if (!existsSync(file)) return void item.hide();
      item.text = `$(debug-continue) ${budgetLabel(readBudget(root(), thisWindow()))}`;
      item.show();
    } catch {
      item.hide();
    }
  };

  const watch = () => {
    // A watcher outside the workspace on a folder that does not exist yet never fires.
    const folder = dirname(budgetFile(root(), thisWindow()));
    try {
      mkdirSync(folder, { recursive: true });
    } catch {
      // Unwritable store: the item stays hidden and the command reports nothing.
    }
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(folder), `${process.pid}.json`));
    w.onDidCreate(update);
    w.onDidChange(update);
    w.onDidDelete(update);
    return w;
  };
  let watcher = watch();

  context.subscriptions.push(
    vscode.commands.registerCommand("clearResume.stepAuto", () => {
      setBudget(root(), thisWindow(), nextBudget(readBudget(root(), thisWindow())));
      update();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("clearResume.storePath")) return;
      watcher.dispose();
      watcher = watch();
      update();
    }),
    { dispose: () => watcher.dispose() },
  );
  update();
}

/**
 * Open a new Claude Code conversation with the handover's prompt pre-filled, then
 * archive the record so the same handover cannot be loaded twice.
 *
 * The command is called in-process. The `vscode://anthropic.claude-code/open` URI
 * reaches the same code but shows a confirmation dialog and, on Windows, routes to
 * an arbitrary window - during the spike it landed in an unrelated workspace.
 */
async function resume(record: StoredHandover, root: string): Promise<boolean> {
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
function archived(record: StoredHandover, root: string): void {
  pushed(root, () => archiveRecord(record.id, { root, by: { owner: "", pid: String(process.pid), via: "extension" } }));
}

/**
 * Open the next conversation where `clearResume.autoContinue.mode` says, and
 * archive the record. Returns where it opened, for the toast, or null when
 * nothing opened. Terminal mode needs the handover as a file whose path every
 * shell reads as written; without that it opens in the panel and says why.
 */
async function openNext(record: StoredHandover, root: string, win: HostWindow): Promise<string | null> {
  const mode = vscode.workspace.getConfiguration("clearResume").get<Mode>("autoContinue.mode");
  const surface = typeof record.surface === "string" ? record.surface : undefined;
  if (continueSurface(mode, { surface }) === "terminal") {
    const path = writeLoadedCopy(root, record);
    if (path && safeForShell(path)) {
      openSessionTerminal({ cwd: record.repoPath, window: `${win.pid}@${win.start}`, path, title: record.title });
      archived(record, root);
      return "in a new terminal";
    }
    const why = path ? "its path has a character a shell would misread" : "its file could not be written";
    return (await resume(record, root)) ? `in a new conversation, not a terminal: ${why}` : null;
  }
  return (await resume(record, root)) ? "in a new conversation" : null;
}

/**
 * Auto-continue: when a session in this window saves a handover in answer to the
 * nudge (stamped auto with this window), open the next conversation from it, as
 * the Resume button does, and spend one continue from the window's budget.
 *
 * Runs on every store change, so it guards itself: one continue at a time, and a
 * record that failed to open is not retried (the error already asked the user).
 * The short wait lets the old session finish ending its turn, and lets a save
 * that lands as several writes settle.
 */
const SETTLE_MS = 1500;
// How long to wait for the new conversation's tab, then how long to give the old
// session to finish ending its turn before its tab is closed.
const NEW_TAB_WAIT_MS = 10_000;
const OLD_TURN_GRACE_MS = 10_000;

/** Claude Code chat tabs in this window (probe 2026-10-01: webview viewType contains claudeVSCodePanel). */
function claudeTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .filter((t) => t.input instanceof vscode.TabInputWebview && t.input.viewType.includes("claudeVSCodePanel"));
}

/**
 * Close the session that just handed over, when it can be named: it was the only
 * Claude tab before the continue, and exactly one new tab appeared. A failure
 * here leaves the tab open, which costs nothing.
 */
async function closeOldTab(before: vscode.Tab[]): Promise<void> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let waited = 0; waited < NEW_TAB_WAIT_MS && claudeTabs().length <= before.length; waited += 500) await sleep(500);
  await sleep(OLD_TURN_GRACE_MS);
  const old = oldTabToClose(before, claudeTabs());
  if (old) await vscode.window.tabGroups.close(old);
}

/** The repo's HEAD, or null when it is not a repo or git fails. The real git
 * binary, not the Windows shim, which opens a console window from here. */
function headOf(dir: string): string | null {
  try {
    return execFileSync(GIT_EXE, ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", timeout: 5000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

function autoContinuer(root: () => string, onDone: () => void): () => void {
  let busy = false;
  const tried = new Set<string>();
  return () => {
    if (busy) return;
    busy = true;
    void (async () => {
      try {
        await new Promise((r) => setTimeout(r, SETTLE_MS));
        const win = thisWindow();
        const record = autoContinueFor(listAll(root()), win, hostname());
        if (!record || tried.has(record.id)) return;
        tried.add(record.id);
        // The budget can have run out since the save (a click on the status bar).
        if (!((readBudget(root(), win)?.left ?? 0) > 0)) return;
        const head = headOf(record.repoPath);
        if (stalls(root(), win, head)) {
          void vscode.window.showWarningMessage(
            `clear-resume: auto-continue stopped. The last two continued sessions made no commit, so "${record.title}" is waiting in the list instead.`,
          );
          return;
        }
        const before = claudeTabs();
        const where = await openNext(record, root(), win);
        if (!where) return;
        const after = takeOne(root(), win, head);
        onDone();
        const left = after && Number.isFinite(after.left) ? `${after.left} of ${after.budget} left` : "unlimited";
        void vscode.window.showInformationMessage(`clear-resume: continued "${record.title}" ${where} (${left}).`);
        // The old session ran in a terminal this extension opened (it stamped the
        // id), or in a panel tab. A panel tab is closed only when a new tab
        // appeared beside it, so a panel-to-terminal continue leaves it open.
        const oldTerminal = typeof record.terminal === "string" ? record.terminal : undefined;
        if (oldTerminal) {
          await new Promise((r) => setTimeout(r, OLD_TURN_GRACE_MS));
          closeOldTerminal({ terminal: oldTerminal });
        } else await closeOldTab(before);
      } catch {
        // Auto-continue must never break the extension; the record stays in the list.
      } finally {
        busy = false;
      }
    })();
  };
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
