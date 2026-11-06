import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import * as vscode from "vscode";
import {
  IDLE_DETAIL,
  IDLE_MODES,
  clearWindowIdleMode,
  idleBarVisible,
  idleFromSettings,
  idleFromWindow,
  idleText,
  setWindowIdleMode,
  settingsIdleMode,
  settingsPath,
  windowIdleMode,
  windowPath,
  type IdleMode,
} from "./idle-mode";
import { ownedProcess } from "./window-owner";
import type { StoredHandover } from "../../plugin/packages/store/store.mjs";
import { RelaySource } from "./relay-source";
import { statusText } from "../../plugin/packages/store/view.mjs";
import {
  chainTotals,
  compassDirs,
  effective,
  feedUsage,
  hoverText,
  liveSessions,
  mergeCompassRows,
  newUsage,
  pickSession,
  pickWindow,
  picks,
  pie,
  projectDirName,
  relayText,
  rowForTab,
  withFocus,
  type CompassRow,
  type LiveSession,
  type RelayFile,
  type RelaySet,
  type Usage,
} from "../../plugin/packages/store/relay-state.mjs";

const POLL_MS = 5_000;
const DEFAULT_NUDGE_AT = 250_000;
// Read a transcript in pieces: they reach hundreds of MB, and the first read of
// one is the whole file.
const CHUNK = 4 * 1024 * 1024;

const projectsDir = () => join(homedir(), ".claude", "projects");
// The relay mod writes under CORNERMAN_HOME or ~/.cornerman, whatever the
// sidebar's storePath says, so this reads from the same place. The extension hands
// over its store root, worked out once: resolveStore stats two folders, and this
// was asked for once per relay file on every poll (2026-11-04).
let storeDir: () => string = () => "";
const relayDir = () => join(storeDir(), "relay");

const NUDGE_MIN = 50_000;
const NUDGE_MAX = 1_000_000;
const NUDGE_PICKS = [60_000, 100_000, 130_000, 150_000, 180_000, 250_000, 400_000, 600_000];

/** The window's nudge size from the footer picker (<key>.nudge.json), which the nudge hooks read too. */
async function windowNudge(win: Pick<RelayFile, "key" | "sessions"> | null | undefined, relay: RelaySource): Promise<number | null> {
  if (!win?.key) return null;
  const read = async (key: string) => {
    const j = await readJsonAsync<{ limit?: number; at?: number }>(join(relayDir(), `${key}.nudge.json`));
    const n = Number(j?.limit);
    return Number.isFinite(n) && n >= NUDGE_MIN && n <= NUDGE_MAX ? { n, at: Number(j?.at) || 0 } : null;
  };
  const own = await read(win.key);
  if (own) return own.n;
  // A reload writes a new relay file for the same session, with no choice of its own:
  // take the newest choice made on any relay file that holds one of this window's sessions.
  let best: { n: number; at: number } | null = null;
  for (const f of await relay.files()) {
    if (f.key === win.key || !f.sessions?.some((id) => win.sessions?.includes(id))) continue;
    const c = await read(f.key);
    if (c && (!best || c.at > best.at)) best = c;
  }
  return best ? best.n : null;
}

/** nudge_at from the plugin's options in ~/.claude/settings.json, else the default. */
async function nudgeAt(win: Pick<RelayFile, "key" | "sessions"> | null | undefined, relay: RelaySource): Promise<number> {
  const own = await windowNudge(win, relay);
  if (own !== null) return own;
  const s = await readJsonAsync<any>(join(homedir(), ".claude", "settings.json"));
  const n = Number(s?.pluginConfigs?.["cornerman@cornerman"]?.options?.nudge_at);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_NUDGE_AT;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

// Everything the 5 s poll reads goes through here: a read that blocked held every
// extension in the window (2026-11-04).
async function readJsonAsync<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: the process exists but is not ours to signal.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Questlog (optional, a separate extension; Session Compass before 1.0.0) records
 * the title it gave each session's tab in <config dir>/questlog/<session id>.json.
 * Matching the active tab's label to a title tells which session has focus.
 * Nothing here when Questlog is not installed.
 */
async function compassRows(): Promise<CompassRow[]> {
  const read = async (dir: string) => {
    const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".json"));
    const rows = await Promise.all(names.map((n) => readJsonAsync<CompassRow>(join(dir, n))));
    return rows.filter((r): r is CompassRow => !!r && typeof r.id === "string" && typeof r.title === "string" && r.title !== "");
  };
  return mergeCompassRows(await Promise.all(compassDirs(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")).map(read)));
}

/**
 * Claude Code's record of each running Claude process, ~/.claude/sessions/<pid>.json,
 * naming the session it holds now (it changes on /clear). Not a documented file:
 * when it is missing or changes shape, nothing here is known and the pie falls
 * back to the newest relay file and transcript, as before.
 */
async function claudeProcesses(): Promise<LiveSession[]> {
  const dir = join(homedir(), ".claude", "sessions");
  try {
    // Other tools write here too (49,300 session-<ms>.json from one hook, 2026-11-06),
    // and the name filter skips them: ~10 ms to list that folder. Read only the
    // records whose process is still running, so a dead session is never named.
    const live = (await readdir(dir)).filter((n) => /^\d+\.json$/.test(n) && pidAlive(Number.parseInt(n, 10)));
    const records = await Promise.all(live.map((n) => readJsonAsync<LiveSession>(join(dir, n))));
    return records.filter((r): r is LiveSession => !!r && Number.isInteger(r.pid) && typeof r.sessionId === "string");
  } catch {
    return [];
  }
}

/** The newest transcript in a folder's project directory: the window's session when the relay mod has written nothing. */
async function newestSession(folder: string): Promise<string | null> {
  const dir = join(projectsDir(), projectDirName(folder));
  try {
    const names = (await readdir(dir)).filter((n) => n.endsWith(".jsonl"));
    const times = await Promise.all(names.map((n) => stat(join(dir, n)).then((s) => s.mtimeMs, () => -1)));
    let best = -1;
    times.forEach((t, i) => {
      if (t >= 0 && (best < 0 || t > times[best])) best = i;
    });
    return best >= 0 ? names[best].slice(0, -6) : null;
  } catch {
    return null;
  }
}

const exists = (path: string) => stat(path).then(() => true, () => false);

type Tail = { path: string; offset: number; decoder: StringDecoder; usage: Usage };

/** Each session's transcript, read once and then only the bytes appended since. */
class Transcripts {
  private tails = new Map<string, Tail>();

  private async find(id: string, cwd: string | undefined): Promise<string | null> {
    const name = `${id}.jsonl`;
    if (cwd) {
      const p = join(projectsDir(), projectDirName(cwd), name);
      if (await exists(p)) return p;
    }
    try {
      for (const d of await readdir(projectsDir())) {
        const p = join(projectsDir(), d, name);
        if (await exists(p)) return p;
      }
    } catch {
      // No ~/.claude/projects: nothing to read.
    }
    return null;
  }

  async usage(id: string, cwd: string | undefined): Promise<Usage | null> {
    let t = this.tails.get(id);
    if (!t) {
      const path = await this.find(id, cwd);
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
export function statsStatus(
  context: vscode.ExtensionContext,
  root: () => string,
  loaded: (pid: string | null) => Promise<StoredHandover | null>,
  openHandover: (record: StoredHandover | null) => void,
): { rewatch: () => void } {
  storeDir = root;
  // The relay files in memory, reread where the watcher says. Once a minute the whole
  // folder is listed again, without blocking, in case the watcher missed a write.
  const relay = new RelaySource(relayDir);
  let relayWatch: vscode.FileSystemWatcher | undefined;
  const rewatch = () => {
    relayWatch?.dispose();
    relay.changed();
    relayWatch = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(relayDir()), "*.json"));
    const changed = (uri: vscode.Uri) => relay.changed(uri.fsPath);
    relayWatch.onDidCreate(changed);
    relayWatch.onDidChange(changed);
    relayWatch.onDidDelete(changed);
  };
  rewatch();
  const rescan = setInterval(() => relay.changed(), 60_000);
  context.subscriptions.push({ dispose: () => (clearInterval(rescan), relayWatch?.dispose()) });
  const pieItem = vscode.window.createStatusBarItem("cornerman.context", vscode.StatusBarAlignment.Left, 1);
  pieItem.name = "cornerman: context";
  const relayItem = vscode.window.createStatusBarItem("cornerman.relay", vscode.StatusBarAlignment.Left, 0.5);
  relayItem.name = "cornerman: relay";
  const idleItem = vscode.window.createStatusBarItem("cornerman.idle", vscode.StatusBarAlignment.Left, 0.42);
  idleItem.name = "cornerman: idle handover";
  context.subscriptions.push(pieItem, relayItem, idleItem);

  const transcripts = new Transcripts();
  let window: RelayFile | null = null;
  let focused: string | null = null;
  // "tab" when the footer follows the focused tab's own relay file, else "window".
  let scope = "window";
  // The handover the hover card names, which the pie's click and "Open handover" open.
  let shown: StoredHandover | null = null;
  let busy = false;
  let rerun = false;
  // Two windows on one folder each show their own session: a Claude process is
  // this window's when its parent is this extension host.
  const owned = ownedProcess(() => void update());

  const folders = () => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath).filter(Boolean);
  const setPath = (key: string) => join(relayDir(), `${key}.set.json`);

  const update = async () => {
    if (busy) {
      // A tab switch during a read: run again when it ends, not at the next poll.
      rerun = true;
      return;
    }
    busy = true;
    try {
      const roots = folders();
      // The focused tab's session, when compass has named it; sticky while a file tab has focus.
      const active = vscode.window.tabGroups.activeTabGroup.activeTab;
      const rows = await compassRows();
      const tab = rowForTab(rows, active?.label ?? "", Date.now());
      if (tab) focused = tab.id;
      // A Claude tab compass has no row for yet (a fresh one) is not the tab we
      // last followed: show nothing rather than that tab's count as this one's.
      // Only when compass is running; without it no tab ever has a row.
      else if (rows.length && active?.input instanceof vscode.TabInputWebview && active.input.viewType.endsWith("claudeVSCodePanel")) {
        focused = null;
        pieItem.hide();
        relayItem.hide();
        return;
      }
      const procs = await claudeProcesses();
      const live = withFocus(
        liveSessions(procs, (r) => owned(String(r.pid), `${r.pid}@${r.procStart ?? ""}`)),
        focused,
      );
      window = roots.length ? pickWindow(await relay.files(), roots, { ...live, focused }) : null;
      const pick = pickSession({
        focused,
        chain: window?.sessions ?? [],
        mine: live.mine,
        newest: live.mine.length ? null : await newestSession(roots[0] ?? ""),
      });
      const sessions = pick.sessions;
      scope = pick.byTab ? "tab" : "window";
      // The handover is the shown tab's own: the one its Claude process loaded.
      // With no tab to go by, the window's.
      const shownPid = pick.byTab ? procs.find((p) => p.sessionId === sessions.at(-1))?.pid : undefined;
      shown = await loaded(shownPid === undefined ? null : String(shownPid));
      const usages: Usage[] = [];
      for (const id of sessions) {
        const u = await transcripts.usage(id, window?.cwd ?? roots[0]);
        if (u) usages.push(u);
      }
      const ownIdle = window ? idleFromWindow(await readJsonAsync(windowPath(relayDir(), window.key))) : null;
      const idle = ownIdle ?? idleFromSettings(await readJsonAsync(settingsPath()));
      const current = usages.at(-1);
      if (!current || current.last === null) {
        pieItem.hide();
      } else {
        const threshold = await nudgeAt(window, relay);
        const p = pie(current.last, threshold);
        const relaySet = window ? effective(window, await readJsonAsync<RelaySet>(setPath(window.key))) : null;
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
            relay: relaySet,
            totals: chainTotals(usages),
            links: {
              handover: shown ? "command:cornerman.openContextHandover" : undefined,
              log: window ? "command:cornerman.relayLog" : undefined,
              nudge: window ? "command:cornerman.pickNudge" : undefined,
              handNow: window ? "command:cornerman.handoverNow" : undefined,
              idle: window ? "command:cornerman.pickIdle" : undefined,
            },
            scope: pick.byTab ? "tab" : "window",
            handover: shown ? statusText(shown, new Date()) : undefined,
            idle: window ? idle : undefined,
          }),
        );
        md.isTrusted = {
          enabledCommands: [
            "cornerman.openContextHandover",
            "cornerman.relayLog",
            "cornerman.pickNudge",
            "cornerman.handoverNow",
            "cornerman.pickIdle",
          ],
        };
        pieItem.tooltip = md;
        pieItem.command = { command: "cornerman.openContextHandover", title: "Open loaded handover" };
        pieItem.show();
      }
      if (window) {
        const set = effective(window, await readJsonAsync<RelaySet>(setPath(window.key)));
        relayItem.text = relayText(set);
        relayItem.tooltip = set.pending
          ? `Relay budget for this ${scope} (takes effect after the next reply). Click to change.`
          : `Relay budget for this ${scope}: clears used of the limit. Click to change.`;
        relayItem.command = "cornerman.pickRelay";
        relayItem.show();
        if (idleBarVisible(idle)) {
          idleItem.text = idleText(idle);
          idleItem.tooltip = `Idle handover: ${idle}, ${IDLE_DETAIL[idle]}. ${
            ownIdle ? `Picked for this ${scope}` : "From your settings (idle_handover)"
          }; a change reaches the running session within 30 seconds. Click to change.`;
          idleItem.command = "cornerman.pickIdle";
          idleItem.show();
        } else {
          idleItem.hide();
        }
      } else {
        relayItem.hide();
        idleItem.hide();
      }
    } catch {
      // A status-bar item must never break the extension.
      pieItem.hide();
      relayItem.hide();
    } finally {
      busy = false;
      if (rerun) {
        rerun = false;
        void update();
      }
    }
  };

  let debounce: NodeJS.Timeout | undefined;
  const soon = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => void update(), 150);
  };

  const pickRelay = async () => {
    if (!window) {
      void vscode.window.showInformationMessage("cornerman: no relay in this window yet. It starts with the next Claude session here.");
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
    qp.title = `Relay for this ${scope}`;
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

  const pickNudge = async () => {
    if (!window) {
      void vscode.window.showInformationMessage("cornerman: no relay in this window yet. It starts with the next Claude session here.");
      return;
    }
    const target = window;
    const now = await nudgeAt(target, relay);
    const sizes = NUDGE_PICKS.includes(now) ? NUDGE_PICKS : [...NUDGE_PICKS, now].sort((a, b) => a - b);
    const items = sizes.map((n) => ({
      label: `${n === now ? "$(check)" : "$(blank)"} ${Math.round(n / 1000)}k`,
      description: n === now ? "now" : `${n.toLocaleString("en-US")} tokens`,
      limit: n as number | null,
    }));
    items.push({ label: "$(discard) Use my settings", description: "drop this window's choice", limit: null });
    const qp = vscode.window.createQuickPick<(typeof items)[number]>();
    qp.title = "Nudge size for this window";
    qp.placeholder = `Now: ${Math.round(now / 1000)}k. Pick a size, or type a number of tokens (${NUDGE_MIN.toLocaleString("en-US")} to ${NUDGE_MAX.toLocaleString("en-US")}).`;
    qp.items = items;
    const cur = items.find((i) => i.limit === now);
    if (cur) qp.activeItems = [cur];
    // A typed size ("120k" or "120000") becomes the first choice.
    qp.onDidChangeValue((v) => {
      const m = /^\s*(\d+(?:\.\d+)?)\s*(k?)\s*$/i.exec(v);
      const n = m ? Math.round(Number(m[1]) * (m[2] ? 1000 : 1)) : NaN;
      qp.items =
        n >= NUDGE_MIN && n <= NUDGE_MAX
          ? [{ label: `$(edit) ${Math.round(n / 1000)}k`, description: `${n.toLocaleString("en-US")} tokens`, limit: n }, ...items]
          : items;
    });
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
    const path = join(relayDir(), `${target.key}.nudge.json`);
    if (chosen.limit === null) {
      try {
        unlinkSync(path);
      } catch {
        // Already gone.
      }
    } else {
      writeFileSync(path, JSON.stringify({ limit: chosen.limit, at: Date.now() }));
    }
    await update();
  };

  const pickIdle = async () => {
    if (!window) {
      void vscode.window.showInformationMessage("cornerman: no relay in this window yet. It starts with the next Claude session here.");
      return;
    }
    const target = window;
    const own = windowIdleMode(relayDir(), target.key);
    const now = own ?? settingsIdleMode();
    const items: { label: string; description: string; mode: IdleMode | null }[] = IDLE_MODES.map((m) => ({
      label: `${m === now ? "$(check)" : "$(blank)"} ${m}`,
      description: IDLE_DETAIL[m],
      mode: m,
    }));
    items.push({ label: "$(discard) Use my settings", description: `drop this window's choice (idle_handover: ${settingsIdleMode()})`, mode: null });
    const chosen = await vscode.window.showQuickPick(items, {
      title: `Idle handover for this ${scope}`,
      placeHolder: `Now: ${now}. Takes effect in the running session within 30 seconds.`,
    });
    if (!chosen) return;
    if (chosen.mode === null) clearWindowIdleMode(relayDir(), target.key);
    else setWindowIdleMode(relayDir(), target.key, chosen.mode);
    await update();
  };

  // The relay mod polls for <key>.handover.json and runs the handover skill when
  // its `at` is newer than the last one it took.
  const handoverNow = () => {
    if (!window) {
      void vscode.window.showInformationMessage("cornerman: no Claude session in this window yet.");
      return;
    }
    writeFileSync(join(relayDir(), `${window.key}.handover.json`), JSON.stringify({ at: Date.now() }));
    void vscode.window.setStatusBarMessage("cornerman: asked for a handover", 4000);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("cornerman.handoverNow", handoverNow),
    vscode.commands.registerCommand("cornerman.openContextHandover", () => openHandover(shown)),
    vscode.commands.registerCommand("cornerman.pickRelay", pickRelay),
    vscode.commands.registerCommand("cornerman.pickNudge", pickNudge),
    vscode.commands.registerCommand("cornerman.pickIdle", pickIdle),
    vscode.commands.registerCommand("cornerman.relayLog", async () => {
      if (!window) return;
      await vscode.window.showTextDocument(vscode.Uri.file(join(relayDir(), `${window.key}.json`)), { preview: true });
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void update()),
    // A focus move, or a retitled tab: one refresh per burst of events.
    vscode.window.tabGroups.onDidChangeTabs(soon),
    vscode.window.tabGroups.onDidChangeTabGroups(soon),
    { dispose: () => clearTimeout(debounce) },
  );

  const timer = setInterval(() => void update(), POLL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  void update();
  return { rewatch };
}
