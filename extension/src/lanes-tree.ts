import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { listAll, type StoredHandover } from "../../plugin/packages/store/store.mjs";
import { lanes, parseWorktreeList, stamp, type Lane, type NextUp } from "../../plugin/packages/store/lanes.mjs";
import { describe } from "../../plugin/packages/store/view.mjs";
import { currentRepoPath, type HandoverNode } from "./tree";

type Node = LaneNode | NextGroupNode | NextNode | HandoverNode;

interface LaneNode {
  kind: "lane";
  lane: Lane;
}
interface NextGroupNode {
  kind: "nextGroup";
  next: NextUp[];
}
interface NextNode {
  kind: "next";
  item: NextUp;
}

/**
 * The open repo's checkouts, oldest first, each with its label, start time and the
 * state of its newest handover. With a registry configured, its queued entries for
 * this repo follow as "Next up".
 */
export class LanesProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly storeRootPath: () => string, private readonly registryPath: () => string) {}

  refresh(): void {
    this.changed.fire(undefined);
  }

  getChildren(node?: Node): Node[] {
    if (node?.kind === "lane") return node.lane.handovers.map((record) => ({ kind: "handover", record }));
    if (node?.kind === "nextGroup") return node.next.map((item) => ({ kind: "next", item }));
    if (node) return [];

    const here = currentRepoPath();
    if (!here) return [];
    const entries = readEntries(this.registryPath());
    const { lanes: rows, next } = lanes({ worktrees: readWorktrees(here), entries, records: listAll(this.storeRootPath()), now: new Date() });
    const out: Node[] = rows.map((lane) => ({ kind: "lane", lane }));
    if (next.length) out.push({ kind: "nextGroup", next });
    return out;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "lane") return laneItem(node.lane, this.registryPath());
    if (node.kind === "nextGroup") {
      const item = new vscode.TreeItem("Next up", vscode.TreeItemCollapsibleState.Expanded);
      item.description = String(node.next.length);
      item.contextValue = "lanes:next";
      return item;
    }
    if (node.kind === "next") {
      const n = node.item;
      const item = new vscode.TreeItem(n.short, vscode.TreeItemCollapsibleState.None);
      item.description = [n.context, n.queuedAt && `queued ${stamp(n.queuedAt)}`].filter(Boolean).join(" · ");
      item.tooltip = n.entry.why || n.short;
      item.iconPath = new vscode.ThemeIcon("circle-outline");
      item.contextValue = "lanes:queued";
      return item;
    }
    // A handover under its lane: the same buttons as in the Handovers view.
    const r: StoredHandover = node.record;
    const item = new vscode.TreeItem(r.title, vscode.TreeItemCollapsibleState.None);
    item.description = describe(r);
    item.id = `lane:${r.id}`;
    item.iconPath = new vscode.ThemeIcon(r.status === "waiting" ? "bookmark" : "check");
    item.contextValue = `handover:${r.status}:${r.pinned ? "pinned" : "unpinned"}`;
    item.command = { command: "clearResume.open", title: "Open handover", arguments: [node] };
    return item;
  }
}

function laneItem(lane: Lane, registryPath: string): vscode.TreeItem {
  const label = lane.main ? `main · ${lane.title}` : `${lane.seq}. ${lane.title}`;
  const item = new vscode.TreeItem(label, lane.handovers.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
  item.description = [lane.startedAt && `started ${stamp(lane.startedAt)}`, lane.state, lane.context].filter(Boolean).join(" · ");
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${lane.title}**\n\n`);
  if (lane.why) md.appendMarkdown(`${lane.why}\n\n`);
  md.appendMarkdown(`\`${lane.path}\`${lane.branch ? ` · \`${lane.branch}\`` : ""}`);
  item.tooltip = md;
  item.id = `lane:${lane.path}`;
  item.iconPath = new vscode.ThemeIcon(lane.main ? "home" : lane.state.startsWith("handover waiting") ? "bookmark" : "git-branch");
  item.contextValue = lane.main ? "lanes:main" : "lanes:worktree";
  item.resourceUri = vscode.Uri.file(lane.path);
  const ws = lane.entry ? workspaceFile(registryPath, lane.entry.slug) : "";
  item.command = { command: "clearResume.openLane", title: "Open window", arguments: [ws || lane.path] };
  return item;
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
