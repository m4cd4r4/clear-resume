import * as vscode from "vscode";

/** The workspace folder the user is in, or "" when there is no folder open. */
export function currentRepoPath(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
}
