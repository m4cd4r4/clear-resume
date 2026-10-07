import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { actionJson, isDue, readState, spareDir, statusText, type SpareAction, type SpareState } from "./spare-state";

const TICK_MS = 1_000;

const enabled = () => vscode.workspace.getConfiguration("clearResume").get<boolean>("spareCycles") === true;

/**
 * The Spare Cycles countdown: `$(watch) 1:42 Wash the dishes`, then
 * `$(bell) Wash the dishes: now` on the warning background once due. The mod owns
 * the timer and writes ~/.spare-cycles/state.json; this only draws it. Behind
 * `clearResume.spareCycles`: off means no item, no watcher and no interval, and
 * turning it on or off takes effect without a reload. Clicking it writes Done,
 * Skip or Snooze to action.json, which the mod polls. Each due task also raises
 * one notification with the same three buttons.
 */
export function spareStatus(context: vscode.ExtensionContext): void {
  let running: vscode.Disposable | undefined;
  let state: SpareState | null = null;

  const act = (action: SpareAction) => {
    const dir = spareDir();
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "action.json"), actionJson(action, Date.now()));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showWarningMessage(`Spare Cycles: could not write the choice: ${message}`);
    }
  };

  // The bar changes when the mod rewrites state.json, not on the pick.
  const pick = async () => {
    if (!state) {
      void vscode.window.showInformationMessage("Spare Cycles: no task yet. The spare-cycles plugin starts one with the next Claude session.");
      return;
    }
    const chosen = await vscode.window.showQuickPick(
      [
        { label: "$(check) Done", action: "done" as const },
        { label: "$(debug-step-over) Skip", action: "skip" as const },
        { label: "$(clock) Snooze", action: "snooze" as const },
      ],
      { title: "Spare Cycles", placeHolder: state.task },
    );
    if (chosen) act(chosen.action);
  };

  // One toast per due task: remembering dueAt keeps the 1s tick and reloads from re-raising it.
  const notify = (due: SpareState) => {
    if (due.dueAt === context.globalState.get<number>("clearResume.spareNotifiedDueAt")) return;
    void context.globalState.update("clearResume.spareNotifiedDueAt", due.dueAt);
    void vscode.window.showInformationMessage(`Spare cycle: ${due.task}`, "Done", "Skip", "Snooze").then((chosen) => {
      if (chosen && enabled()) act(chosen.toLowerCase() as SpareAction);
    });
  };

  const start = (): vscode.Disposable => {
    const dir = spareDir();
    const item = vscode.window.createStatusBarItem("clearResume.spare", vscode.StatusBarAlignment.Left, 0.3);
    item.name = "clear-resume: Spare Cycles";
    item.command = "clearResume.spareAct";

    const draw = () => {
      try {
        if (!state) {
          item.hide();
          return;
        }
        const now = Date.now();
        item.text = statusText(state, now);
        const due = isDue(state, now);
        item.backgroundColor = due ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
        item.tooltip = `${state.lastAction ? `Last: ${state.lastAction}` : "Spare Cycles: nothing done yet"}. Click for Done / Skip / Snooze.`;
        item.show();
        if (due) notify(state);
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
    return vscode.Disposable.from(item, watcher, {
      dispose: () => {
        clearInterval(tick);
        state = null;
      },
    });
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
    vscode.commands.registerCommand("clearResume.spareAct", pick),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("clearResume.spareCycles")) apply();
    }),
    { dispose: () => running?.dispose() },
  );
  apply();
}
