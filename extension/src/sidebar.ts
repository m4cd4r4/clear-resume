import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { listAll } from "../../plugin/packages/store/store.mjs";
import { lanes, parseWorktreeList } from "../../plugin/packages/store/lanes.mjs";
import { worktreePaths } from "../../plugin/packages/store/worktree.mjs";
import { currentRepoPath } from "./tree";
import { pageHtml } from "./sidebar-page";
import { filterSections, handoverSections, lanesModel } from "./sidebar-model";

export type Section = "handovers" | "lanes";

/** What the page may ask of the host. Anything else is dropped. */
type Message =
  | { type: "ready" | "migrate" }
  | { type: "search"; q: string }
  | { type: "open" | "openLoaded" | "resume" | "pin" | "unpin" | "delete"; id: string }
  | { type: "openLane"; target: string };

const WITH_ID = new Set(["open", "openLoaded", "resume", "pin", "unpin", "delete"]);

export function parseMessage(v: unknown): Message | undefined {
  const m = v as { type?: unknown; id?: unknown; q?: unknown; target?: unknown } | null;
  if (!m || typeof m.type !== "string") return undefined;
  if (m.type === "ready" || m.type === "migrate") return { type: m.type };
  if (m.type === "search") return { type: "search", q: typeof m.q === "string" ? m.q.slice(0, 200) : "" };
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

  constructor(
    private readonly section: Section,
    private readonly storeRootPath: () => string,
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
      if (m.type === "ready") this.query = "";
      if (m.type === "search" || m.type === "ready") {
        if (m.type === "search") this.query = m.q;
        this.refresh();
      } else this.run(m);
    });
    view.onDidDispose(() => (this.view = undefined));
    view.onDidChangeVisibility(() => view.visible && this.refresh());
  }

  refresh(): void {
    if (!this.view) return;
    void this.view.webview.postMessage({ type: "model", model: this.model() });
  }

  private model() {
    const now = new Date();
    const here = currentRepoPath();
    const records = listAll(this.storeRootPath());
    if (this.section === "handovers") {
      // Worktrees of the open repo are the same repo; without them a project driven
      // through worktrees files most of its own handovers under "Other repos".
      const sections = handoverSections(records, { repoPath: here, roots: worktreePaths(here), now, showArchived: this.showArchived() });
      return { section: "handovers", query: this.query, hasLegacy: this.hasLegacy(), sections: filterSections(sections, this.query) };
    }
    if (!here) return { section: "lanes", query: this.query, lanes: { lanes: [], next: [] } };
    const registry = this.registryPath();
    const data = lanes({ worktrees: readWorktrees(here), entries: readEntries(registry), records, now });
    const model = lanesModel(data, { now, targetOf: (l) => (l.entry && workspaceFile(registry, l.entry.slug)) || l.path });
    return { section: "lanes", query: this.query, lanes: model };
  }
}

/** `git worktree list` for the repo at `dir`, each with the time its checkout was made. */
function readWorktrees(dir: string) {
  try {
    const out = execFileSync("git", ["-C", dir, "worktree", "list", "--porcelain"], { timeout: 3000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return parseWorktreeList(out).map((w) => ({ ...w, startedAt: createdAt(w.path) }));
  } catch {
    return [];
  }
}

// A linked worktree's `.git` is a file written by `git worktree add`, so its birth
// time is when the worktree began. Where the filesystem has no birth time, mtime.
function createdAt(path: string): string {
  try {
    const s = statSync(join(path, ".git"));
    const t = s.birthtimeMs || s.mtimeMs;
    return t ? new Date(t).toISOString() : "";
  } catch {
    return "";
  }
}

function readEntries(path: string): any[] {
  if (!path || !existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")).entries ?? [];
  } catch {
    return [];
  }
}

// A minting script may keep a .code-workspace per worktree beside the registry,
// named "<project>-<slug>.code-workspace". Opening that rather than the bare folder
// keeps the window's title and colour.
function workspaceFile(registryPath: string, slug: string): string {
  if (!registryPath) return "";
  try {
    const dir = dirname(registryPath);
    const f = readdirSync(dir).find((n) => n.endsWith(`-${slug}.code-workspace`));
    return f ? join(dir, f) : "";
  } catch {
    return "";
  }
}
