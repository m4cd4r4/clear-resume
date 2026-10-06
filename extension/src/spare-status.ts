import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { storeRoot } from "../../plugin/packages/store/store.mjs";

/**
 * Spare Cycles bridge probe. The Claude Code VS Code panel raises no ui.render to
 * mods (2.1.289), so a mod cannot draw there. The mod owns the timer and writes
 * state.json; this draws it as a status bar countdown and writes the person's
 * Done/Skip/Snooze to action.json, which the mod polls.
 */
type SpareState = { version: number; task: string; dueAt: number; isDue: boolean; lastAction: string; updatedAt: number };

const dir = () => join(storeRoot(), "spare-cycles");

function readState(): SpareState | null {
  try {
    const s = JSON.parse(readFileSync(join(dir(), "state.json"), "utf8")) as SpareState;
    return s.version === 1 ? s : null;
  } catch {
    return null;
  }
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function spareStatus(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem("clearResume.spare", vscode.StatusBarAlignment.Left, 0.3);
  item.name = "Spare Cycles";
  item.command = "clearResume.spareAct";
  context.subscriptions.push(item);

  let state = readState();
  let alerted = 0;

  const draw = () => {
    if (!state) {
      item.hide();
      return;
    }
    const left = state.dueAt - Date.now();
    if (left <= 0) {
      item.text = `$(bell) ${state.task}: now`;
      item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      if (alerted !== state.dueAt) {
        alerted = state.dueAt;
        void vscode.window.showInformationMessage(`Spare cycle: ${state.task}`, "Done", "Skip", "Snooze").then((pick) => {
          if (pick) act(pick.toLowerCase() as "done" | "skip" | "snooze");
        });
      }
    } else {
      item.text = `$(watch) ${countdown(left)} ${state.task}`;
      item.backgroundColor = undefined;
    }
    item.tooltip = state.lastAction ? `Last: ${state.lastAction}` : "Spare Cycles: click for Done / Skip / Snooze";
    item.show();
  };

  const act = (action: "done" | "skip" | "snooze") => {
    mkdirSync(dir(), { recursive: true });
    writeFileSync(join(dir(), "action.json"), JSON.stringify({ action, at: Date.now() }) + "\n");
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("clearResume.spareAct", async () => {
      if (!state) return;
      const pick = await vscode.window.showQuickPick(
        [
          { label: "$(check) Done", action: "done" as const },
          { label: "$(debug-step-over) Skip", action: "skip" as const },
          { label: "$(clock) Snooze", action: "snooze" as const },
        ],
        { placeHolder: state.task },
      );
      if (pick) act(pick.action);
    }),
  );

  mkdirSync(dir(), { recursive: true });
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(dir()), "state.json"));
  const reload = () => {
    state = readState();
    draw();
  };
  watcher.onDidCreate(reload);
  watcher.onDidChange(reload);
  watcher.onDidDelete(reload);
  const tick = setInterval(draw, 1000);
  context.subscriptions.push(watcher, { dispose: () => clearInterval(tick) });
  draw();
}
