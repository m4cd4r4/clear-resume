import * as vscode from "vscode";
import { listAll, type StoredHandover } from "../../packages/store/store.mjs";
import { describe, group, type Group } from "../../packages/store/view.mjs";

type Node = GroupNode | HandoverNode;

export interface GroupNode {
  kind: "group";
  group: Group;
}

export interface HandoverNode {
  kind: "handover";
  record: StoredHandover;
}

export class HistoryProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly storeRootPath: () => string, private readonly showArchived: () => boolean) {}

  refresh(): void {
    this.changed.fire(undefined);
  }

  getChildren(node?: Node): Node[] {
    if (node?.kind === "handover") return [];

    const now = new Date();
    const groups = group(listAll(this.storeRootPath()), { repoPath: currentRepoPath(), now }).filter(
      (g) => g.id !== "archived" || this.showArchived(),
    );

    if (node?.kind === "group") return node.group.records.map((record) => ({ kind: "handover", record }));

    // One group only: skip the heading and show its rows directly. A single
    // collapsible node wrapping everything is a click that buys nothing.
    if (groups.length === 1) return groups[0].records.map((record) => ({ kind: "handover", record }));
    return groups.map((g) => ({ kind: "group", group: g }));
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "group") {
      const item = new vscode.TreeItem(node.group.label, vscode.TreeItemCollapsibleState.Expanded);
      item.description = String(node.group.records.length);
      item.contextValue = `group:${node.group.id}`;
      return item;
    }

    const r = node.record;
    const item = new vscode.TreeItem(r.title, vscode.TreeItemCollapsibleState.None);
    item.description = describe(r);
    item.tooltip = tooltip(r);
    item.id = r.id;
    item.iconPath = new vscode.ThemeIcon(r.pinned ? "pinned" : r.status === "archived" ? "history" : "bookmark");
    // The inline buttons are scoped off this string, so pinned state is part of it.
    item.contextValue = `handover:${r.status}:${r.pinned ? "pinned" : "unpinned"}`;
    item.command = { command: "clearResume.open", title: "Open handover", arguments: [node] };
    return item;
  }
}

function tooltip(r: StoredHandover): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${escapeMd(r.title)}**\n\n`);
  md.appendMarkdown(`${escapeMd(r.repoPath)}${r.branch ? ` · \`${escapeMd(r.branch)}\`` : ""}\n\n`);
  md.appendMarkdown(`${new Date(r.createdAt).toLocaleString()} · ${r.status}${r.pinned ? " · pinned" : ""}\n\n`);
  md.appendCodeblock(r.resumePrompt.slice(0, 600), "markdown");
  return md;
}

function escapeMd(s: string): string {
  return s.replace(/[\\`*_{}[\]()#+\-.!|]/g, (c) => `\\${c}`);
}

/** The workspace folder the user is in, or "" when there is no folder open. */
export function currentRepoPath(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
}
