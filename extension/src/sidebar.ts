import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { lanes, parseWorktreeList } from "../../plugin/packages/store/lanes.mjs";
import { worktreePaths } from "../../plugin/packages/store/worktree.mjs";
import { currentRepoPath } from "./tree";
import { pageHtml } from "./sidebar-page";
import { filterSections, handoverSections, lanesModel, pageJson } from "./sidebar-model";
import type { StoreSource } from "./store-source";

export type Section = "handovers" | "lanes";

/** What the page may ask of the host. Anything else is dropped. */
type Message =
  | { type: "ready" | "migrate" }
  | { type: "search"; q: string }
  | { type: "open" | "openLoaded" | "resume" | "pin" | "unpin" | "delete"; id: string }
  | { type: "asset"; id: string; n: number }
  | { type: "openLane"; target: string };

const WITH_ID = new Set(["open", "openLoaded", "resume", "pin", "unpin", "delete"]);

export function parseMessage(v: unknown): Message | undefined {
  const m = v as { type?: unknown; id?: unknown; q?: unknown; target?: unknown; n?: unknown } | null;
  if (!m || typeof m.type !== "string") return undefined;
  if (m.type === "ready" || m.type === "migrate") return { type: m.type };
  if (m.type === "search") return { type: "search", q: typeof m.q === "string" ? m.q.slice(0, 200) : "" };
  if (m.type === "asset") return typeof m.id === "string" && m.id && Number.isInteger(m.n) ? { type: "asset", id: m.id, n: m.n as number } : undefined;
  if (m.type === "openLane") return typeof m.target === "string" && m.target ? { type: "openLane", target: m.target } : undefined;
  if (WITH_ID.has(m.type) && typeof m.id === "string" && m.id) return { type: m.type as "open", id: m.id };
  return undefined;
}

/**
 * One of the two sidebar views. Both draw the same page; the model it is sent says
 * which section it is. A page-side action comes back as a message and runs the
 * command the tree row's button used to run.
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private query = "";
  // One refresh at a time; asks that land during one run it once more when it ends.
  private running = false;
  private again = false;
  // The last model sent: an unchanged one is not sent again.
  private sent = "";

  constructor(
    private readonly section: Section,
    private readonly source: StoreSource,
    private readonly showArchived: () => boolean,
    private readonly registryPath: () => string,
    private readonly hasLegacy: () => boolean,
    private readonly run: (m: Message) => void,
  ) {}

  get visible(): boolean {
    return this.view?.visible === true;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    const nonce = randomBytes(16).toString("hex");
    view.webview.html = pageHtml(nonce, view.webview.cspSource);
    view.webview.onDidReceiveMessage((v: unknown) => {
      const m = parseMessage(v);
      if (!m) return;
      if (m.type === "ready") {
        // A page that just loaded has nothing drawn: it gets a model even if this one was sent before.
        this.query = "";
        this.sent = "";
      }
      if (m.type === "search" || m.type === "ready") {
        if (m.type === "search") this.query = m.q;
        this.refresh();
      } else this.run(m);
    });
    view.onDidDispose(() => {
      this.view = undefined;
      this.sent = "";
    });
    view.onDidChangeVisibility(() => view.visible && this.refresh());
  }

  /**
   * Send the page a fresh model. Nothing here reads the disk synchronously: the
   * extension host is shared, and a refresh that held it froze every extension in the
   * window (2026-11-04).
   */
  refresh(): void {
    if (!this.view) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    void this.model()
      .then((model) => {
        const json = pageJson(model);
        if (!this.view || json === this.sent) return;
        this.sent = json;
        return this.view.webview.postMessage({ type: "model", json });
      })
      .catch(() => undefined)
      .finally(() => {
        this.running = false;
        if (this.again) {
          this.again = false;
          this.refresh();
        }
      });
  }

  private async model(): Promise<Record<string, unknown>> {
    const now = new Date();
    const here = currentRepoPath();
    const { records, captures } = await this.source.snapshot();
    if (this.section === "handovers") {
      // Worktrees of the open repo are the same repo; without them a project driven
      // through worktrees files most of its own handovers under "Other repos".
      const sections = handoverSections(records, { repoPath: here, roots: worktreePaths(here), now, showArchived: this.showArchived(), captures });
      return { section: "handovers", query: this.query, hasLegacy: this.hasLegacy(), sections: filterSections(sections, this.query) };
    }
    if (!here) return { section: "lanes", query: this.query, lanes: { lanes: [], next: [] } };
    const registry = this.registryPath();
    const [worktrees, entries, files] = await Promise.all([readWorktrees(here), readEntries(registry), workspaceFiles(registry)]);
    const data = lanes({ worktrees, entries, records, now });
    const model = lanesModel(data, { now, targetOf: (l) => (l.entry && workspaceFile(registry, files, l.entry.slug)) || l.path });
    return { section: "lanes", query: this.query, lanes: model };
  }
}

/** `git worktree list` for the repo at `dir`, each with the time its checkout was made. */
async function readWorktrees(dir: string) {
  const out = await new Promise<string>((resolve) =>
    execFile("git", ["-C", dir, "worktree", "list", "--porcelain"], { timeout: 3000, encoding: "utf8", windowsHide: true }, (err, stdout) => resolve(err ? "" : stdout)),
  );
  if (!out) return [];
  const list = parseWorktreeList(out);
  return Promise.all(list.map(async (w) => ({ ...w, startedAt: await createdAt(w.path) })));
}

// A linked worktree's `.git` is a file written by `git worktree add`, so its birth
// time is when the worktree began. Where the filesystem has no birth time, mtime.
async function createdAt(path: string): Promise<string> {
  try {
    const s = await stat(join(path, ".git"));
    const t = s.birthtimeMs || s.mtimeMs;
    return t ? new Date(t).toISOString() : "";
  } catch {
    return "";
  }
}

async function readEntries(path: string): Promise<any[]> {
  if (!path) return [];
  try {
    return JSON.parse(await readFile(path, "utf8")).entries ?? [];
  } catch {
    return [];
  }
}

/** The names in the registry's folder, read once per refresh for workspaceFile. */
async function workspaceFiles(registryPath: string): Promise<string[]> {
  if (!registryPath) return [];
  return readdir(dirname(registryPath)).catch(() => []);
}

// A minting script may keep a .code-workspace per worktree beside the registry,
// named "<project>-<slug>.code-workspace". Opening that rather than the bare folder
// keeps the window's title and colour.
function workspaceFile(registryPath: string, files: string[], slug: string): string {
  const f = files.find((n) => n.endsWith(`-${slug}.code-workspace`));
  return f ? join(dirname(registryPath), f) : "";
}
