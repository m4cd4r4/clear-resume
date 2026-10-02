import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { autoContinueFor, budgetFile, budgetLabel, nextBudget, readBudget, setBudget, stalls, takeOne, type HostWindow } from "../../plugin/packages/store/autobudget.mjs";
import { listAll, type StoredHandover } from "../../plugin/packages/store/store.mjs";
import { GIT_EXE } from "../../plugin/packages/store/sync.mjs";
import { writeLoadedCopy } from "../../plugin/packages/store/loaded.mjs";
import { oldTabToClose } from "./oldtab";
import { archived, resume } from "./resume";
import { cliTrusts, continueSurface, safeForShell, type Mode } from "./terminal";
import { closeOldTerminal, openSessionTerminal } from "./terminals";

/**
 * This window as the plugin's hooks see it: the extension host, which is the
 * parent of every Claude process in the window. The start is estimated from
 * uptime; plain node lands within 15ms of the process table's figure, well inside
 * the 1s slack readBudget allows.
 */
export const thisWindow = (): HostWindow => ({ pid: String(process.pid), start: Math.round(Date.now() - process.uptime() * 1000) });

/**
 * The auto-continue status-bar item: `auto: 2 of 4 left`, shown once a budget has
 * been set in this window (by /clear-resume:auto or the command). Clicking it
 * steps off, 3, unlimited.
 */
export function autoStatus(context: vscode.ExtensionContext, root: () => string): void {
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

/** The CLI's config file, parsed, or null when it is missing or unreadable (read as untrusted). */
function readClaudeJson(): unknown {
  try {
    return JSON.parse(readFileSync(join(process.env.CLAUDE_CONFIG_DIR || homedir(), ".claude.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Open the next conversation where `clearResume.autoContinue.mode` says, and
 * archive the record. Returns where it opened, for the toast, or null when
 * nothing opened. Terminal mode needs the folder trusted by the CLI (or its
 * prompt waits unseen) and the handover as a file whose path every shell reads
 * as written; without those it opens in the panel and says why.
 */
async function openNext(record: StoredHandover, root: string, win: HostWindow): Promise<string | null> {
  const mode = vscode.workspace.getConfiguration("clearResume").get<Mode>("autoContinue.mode");
  const surface = typeof record.surface === "string" ? record.surface : undefined;
  if (continueSurface(mode, { surface }) === "terminal") {
    if (!cliTrusts(readClaudeJson(), record.repoPath)) {
      const why = "Claude Code has not been trusted in this folder from a terminal: run claude there once";
      return (await resume(record, root)) ? `in a new conversation, not a terminal: ${why}` : null;
    }
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

export function autoContinuer(root: () => string, onDone: () => void): () => void {
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
