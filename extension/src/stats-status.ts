import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import * as vscode from "vscode";
import { ownedProcess } from "./window-owner";
import { storeRoot } from "../../plugin/packages/store/store.mjs";
import {
  chainTotals,
  effective,
  feedUsage,
  hoverText,
  liveSessions,
  newUsage,
  pickWindow,
  picks,
  pie,
  projectDirName,
  relayText,
  type LiveSession,
  type RelayFile,
  type RelaySet,
  type Usage,
} from "../../plugin/packages/store/relay-state.mjs";

const POLL_MS = 5_000;
const DEFAULT_NUDGE_AT = 180_000;
// Read a transcript in pieces: they reach hundreds of MB, and the first read of
// one is the whole file.
const CHUNK = 4 * 1024 * 1024;

const projectsDir = () => join(homedir(), ".claude", "projects");
// The relay mod writes under CLEAR_RESUME_HOME or ~/.clear-resume, whatever the
// sidebar's storePath says, so this reads from the same place.
const relayDir = () => join(storeRoot(), "relay");

/** nudge_at from the plugin's options in ~/.claude/settings.json, else the default. */
function nudgeAt(): number {
  try {
    const s = JSON.parse(readFileSync(join(homedir(), ".claude", "settings.json"), "utf8"));
    const n = Number(s?.pluginConfigs?.["clear-resume@clear-resume"]?.options?.nudge_at);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_NUDGE_AT;
  } catch {
    return DEFAULT_NUDGE_AT;
  }
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function relayFiles(): RelayFile[] {
  try {
    return readdirSync(relayDir())
      .filter((n) => n.endsWith(".json") && !n.endsWith(".set.json") && !n.endsWith(".handover.json"))
      .map((n) => readJson<RelayFile>(join(relayDir(), n)))
      .filter((f): f is RelayFile => f !== null);
  } catch {
    return [];
  }
}

/**
 * Claude Code's record of each running Claude process, ~/.claude/sessions/<pid>.json,
 * naming the session it holds now (it changes on /clear). Not a documented file:
 * when it is missing or changes shape, nothing here is known and the pie falls
 * back to the newest relay file and transcript, as before.
 */
function claudeProcesses(): LiveSession[] {
  const dir = join(homedir(), ".claude", "sessions");
  try {
    return readdirSync(dir)
      .filter((n) => /^\d+\.json$/.test(n))
      .map((n) => readJson<LiveSession>(join(dir, n)))
      .filter((r): r is LiveSession => !!r && Number.isInteger(r.pid) && typeof r.sessionId === "string");
  } catch {
    return [];
  }
}

/** The newest transcript in a folder's project directory: the window's session when the relay mod has written nothing. */
function newestSession(folder: string): string | null {
  const dir = join(projectsDir(), projectDirName(folder));
  try {
    let best: { id: string; t: number } | null = null;
    for (const n of readdirSync(dir)) {
      if (!n.endsWith(".jsonl")) continue;
      const t = statSync(join(dir, n)).mtimeMs;
      if (!best || t > best.t) best = { id: n.slice(0, -6), t };
    }
    return best?.id ?? null;
  } catch {
    return null;
  }
}

type Tail = { path: string; offset: number; decoder: StringDecoder; usage: Usage };

/** Each session's transcript, read once and then only the bytes appended since. */
class Transcripts {
  private tails = new Map<string, Tail>();

  private find(id: string, cwd: string | undefined): string | null {
    const name = `${id}.jsonl`;
    if (cwd) {
      const p = join(projectsDir(), projectDirName(cwd), name);
      if (existsSync(p)) return p;
    }
    try {
      for (const d of readdirSync(projectsDir())) {
        const p = join(projectsDir(), d, name);
        if (existsSync(p)) return p;
      }
    } catch {
      // No ~/.claude/projects: nothing to read.
    }
    return null;
  }

  async usage(id: string, cwd: string | undefined): Promise<Usage | null> {
    let t = this.tails.get(id);
    if (!t) {
      const path = this.find(id, cwd);
      if (!path) return null;
      t = { path, offset: 0, decoder: new StringDecoder("utf8"), usage: newUsage() };
      this.tails.set(id, t);
    }
    const fh = await open(t.path, "r").catch(() => null);
    if (!fh) return t.usage;
    try {
      const size = (await fh.stat()).size;
      if (size < t.offset) {
        // Rewritten from the start: read it again.
        Object.assign(t, { offset: 0, decoder: new StringDecoder("utf8"), usage: newUsage() });
      }
      const buf = Buffer.alloc(Math.min(CHUNK, Math.max(0, size - t.offset)));
      while (t.offset < size) {
        const { bytesRead } = await fh.read(buf, 0, Math.min(buf.length, size - t.offset), t.offset);
        if (bytesRead === 0) break;
        t.offset += bytesRead;
        feedUsage(t.usage, t.decoder.write(buf.subarray(0, bytesRead)));
      }
    } finally {
      await fh.close();
    }
    return t.usage;
  }
}

/**
 * Three status-bar items: the context pie (`◕ 142k/180k`, hover for the chain and
 * the relay, click to open the loaded handover), the relay (`⟳ relay 3/15`,
 * click to set this window's budget) and "Hand over" (click to have the session
 * write a handover now; with the relay on it then clears and continues). The
 * relay and hand-over items show only once the relay mod has written state for a
 * workspace folder.
 */
export function statsStatus(context: vscode.ExtensionContext, openHandover: () => void): void {
  const pieItem = vscode.window.createStatusBarItem("clearResume.context", vscode.StatusBarAlignment.Left, 1);
  pieItem.name = "clear-resume: context";
  const relayItem = vscode.window.createStatusBarItem("clearResume.relay", vscode.StatusBarAlignment.Left, 0.5);
  relayItem.name = "clear-resume: relay";
  const handoverItem = vscode.window.createStatusBarItem("clearResume.handover", vscode.StatusBarAlignment.Left, 0.4);
  handoverItem.name = "clear-resume: hand over now";
  handoverItem.text = "$(debug-step-out) Hand over";
  handoverItem.command = "clearResume.handoverNow";
  context.subscriptions.push(pieItem, relayItem, handoverItem);

  const transcripts = new Transcripts();
  let window: RelayFile | null = null;
  let busy = false;
  // Two windows on one folder each show their own session: a Claude process is
  // this window's when its parent is this extension host.
  const owned = ownedProcess(() => void update());

  const folders = () => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath).filter(Boolean);
  const setPath = (key: string) => join(relayDir(), `${key}.set.json`);

  const update = async () => {
    if (busy) return;
    busy = true;
    try {
      const roots = folders();
      const live = liveSessions(claudeProcesses(), (r) => owned(String(r.pid), `${r.pid}@${r.procStart ?? ""}`));
      window = roots.length ? pickWindow(relayFiles(), roots, live) : null;
      const own = live.mine[0] ?? newestSession(roots[0] ?? "");
      const sessions = window?.sessions.length ? window.sessions : [own].filter((s): s is string => !!s);
      const usages: Usage[] = [];
      for (const id of sessions) {
        const u = await transcripts.usage(id, window?.cwd ?? roots[0]);
        if (u) usages.push(u);
      }
      const current = usages.at(-1);
      if (!current || current.last === null) {
        pieItem.hide();
      } else {
        const threshold = nudgeAt();
        const p = pie(current.last, threshold);
        const relay = window ? effective(window, readJson<RelaySet>(setPath(window.key))) : null;
        pieItem.text = p.text;
        pieItem.backgroundColor =
          p.level === "over"
            ? new vscode.ThemeColor("statusBarItem.errorBackground")
            : p.level === "warn"
              ? new vscode.ThemeColor("statusBarItem.warningBackground")
              : undefined;
        const md = new vscode.MarkdownString(
          hoverText({
            context: current.last,
            threshold,
            relay,
            totals: chainTotals(usages),
            links: {
              handover: "command:clearResume.openContextHandover",
              log: window ? "command:clearResume.relayLog" : undefined,
            },
          }),
        );
        md.isTrusted = { enabledCommands: ["clearResume.openContextHandover", "clearResume.relayLog"] };
        pieItem.tooltip = md;
        pieItem.command = { command: "clearResume.openContextHandover", title: "Open loaded handover" };
        pieItem.show();
      }
      if (window) {
        const relay = effective(window, readJson<RelaySet>(setPath(window.key)));
        relayItem.text = relayText(relay);
        relayItem.tooltip = relay.pending
          ? "Relay budget for this window (takes effect after the next reply). Click to change."
          : "Relay budget for this window: clears used of the limit. Click to change.";
        relayItem.command = "clearResume.pickRelay";
        relayItem.show();
        handoverItem.tooltip =
          relay.limit === 0
            ? "Have Claude write a handover now. The relay is off in this window, so type /clear when it is saved."
            : "Have Claude write a handover now, then clear and continue from it. Waits for the current reply to finish.";
        handoverItem.show();
      } else {
        relayItem.hide();
        handoverItem.hide();
      }
    } catch {
      // A status-bar item must never break the extension.
      pieItem.hide();
      relayItem.hide();
      handoverItem.hide();
    } finally {
      busy = false;
    }
  };

  const pickRelay = async () => {
    if (!window) {
      void vscode.window.showInformationMessage("clear-resume: no relay in this window yet. It starts with the next Claude session here.");
      return;
    }
    const now = effective(window, readJson<RelaySet>(setPath(window.key)));
    const items = picks(now.limit).map((p) => ({
      label: p.current ? `$(check) ${p.label}` : `$(blank) ${p.label}`,
      description: p.limit === "off" ? "no clears by itself" : p.limit === "unlimited" ? "no cap" : `${p.label} clears`,
      limit: p.limit,
      current: p.current,
    }));
    // Opened on the current budget, so Enter alone changes nothing.
    const qp = vscode.window.createQuickPick<(typeof items)[number]>();
    qp.title = "Relay for this window";
    qp.placeholder = `Now: ${relayText(now)}. The count starts over from the next reply.`;
    qp.items = items;
    const cur = items.find((i) => i.current);
    if (cur) qp.activeItems = [cur];
    const chosen = await new Promise<(typeof items)[number] | undefined>((resolve) => {
      qp.onDidAccept(() => {
        resolve(qp.selectedItems[0]);
        qp.hide();
      });
      qp.onDidHide(() => {
        resolve(undefined);
        qp.dispose();
      });
      qp.show();
    });
    if (!chosen) return;
    const target = window;
    writeFileSync(setPath(target.key), JSON.stringify({ limit: chosen.limit, at: Date.now() } satisfies RelaySet));
    await update();
  };

  // The relay mod polls for <key>.handover.json and runs the handover skill when
  // its `at` is newer than the last one it took.
  const handoverNow = () => {
    if (!window) {
      void vscode.window.showInformationMessage("clear-resume: no Claude session in this window yet.");
      return;
    }
    writeFileSync(join(relayDir(), `${window.key}.handover.json`), JSON.stringify({ at: Date.now() }));
    void vscode.window.setStatusBarMessage("clear-resume: asked for a handover", 4000);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("clearResume.handoverNow", handoverNow),
    vscode.commands.registerCommand("clearResume.openContextHandover", openHandover),
    vscode.commands.registerCommand("clearResume.pickRelay", pickRelay),
    vscode.commands.registerCommand("clearResume.relayLog", async () => {
      if (!window) return;
      await vscode.window.showTextDocument(vscode.Uri.file(join(relayDir(), `${window.key}.json`)), { preview: true });
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void update()),
  );

  const timer = setInterval(() => void update(), POLL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  void update();
}
