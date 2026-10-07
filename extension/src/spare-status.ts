import { mkdirSync } from "node:fs";
import * as vscode from "vscode";
import { isDue, readState, spareDir, statusText, type SpareState } from "./spare-state";

const TICK_MS = 1_000;

const enabled = () => vscode.workspace.getConfiguration("clearResume").get<boolean>("spareCycles") === true;

/**
 * The Spare Cycles countdown: `$(watch) 1:42 Wash the dishes`, then
 * `$(bell) Wash the dishes: now` on the warning background once due. The mod owns
 * the timer and writes ~/.spare-cycles/state.json; this only draws it. Behind
 * `clearResume.spareCycles`: off means no item, no watcher and no interval, and
 * turning it on or off takes effect without a reload.
 */
export function spareStatus(context: vscode.ExtensionContext): void {
  let running: vscode.Disposable | undefined;

  const start = (): vscode.Disposable => {
    const dir = spareDir();
    const item = vscode.window.createStatusBarItem("clearResume.spare", vscode.StatusBarAlignment.Left, 0.3);
    item.name = "clear-resume: Spare Cycles";
    let state: SpareState | null = null;

    const draw = () => {
      try {
        if (!state) {
          item.hide();
          return;
        }
        const now = Date.now();
        item.text = statusText(state, now);
        item.backgroundColor = isDue(state, now) ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
        item.tooltip = state.lastAction ? `Last: ${state.lastAction}` : "Spare Cycles: nothing done yet";
        item.show();
      } catch {
        // A status-bar item must never break the extension.
        item.hide();
      }
    };
    const reload = () => {
      state = readState(dir);
      draw();
    };

    // The watcher needs the folder to exist, and the mod may not have run yet.
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // No folder means no state.json: the item stays hidden.
    }
    // A plain string glob does not fire outside the workspace, so build it from a Uri.
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(dir), "state.json"));
    watcher.onDidCreate(reload);
    watcher.onDidChange(reload);
    watcher.onDidDelete(reload);
    const tick = setInterval(draw, TICK_MS);
    reload();
    return vscode.Disposable.from(item, watcher, { dispose: () => clearInterval(tick) });
  };

  const apply = () => {
    if (enabled() && !running) {
      running = start();
    } else if (!enabled() && running) {
      running.dispose();
      running = undefined;
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("clearResume.spareCycles")) apply();
    }),
    { dispose: () => running?.dispose() },
  );
  apply();
}
