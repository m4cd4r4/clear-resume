/** What a readable copy is built from: a stored record carries all of it. */
export interface CopySource {
  id: string;
  title: string;
  repoPath: string;
  branch?: string;
  createdAt: string;
  body: string;
}

export function shortId(id: string): string;
export function loadedDir(root: string): string;
export function loadedCopyName(record: Pick<CopySource, "id" | "title" | "repoPath">, opts?: { home?: string }): string;
export function loadedCopyPath(root: string, record: Pick<CopySource, "id" | "title" | "repoPath">, opts?: { home?: string }): string;
export function loadedCopyText(record: CopySource, opts?: { loadedAt?: Date | string; home?: string }): string;
export function writeLoadedCopy(root: string, record: CopySource, opts?: { loadedAt?: Date | string; home?: string }): string | null;
export function pruneLoaded(opts?: { root?: string; now?: Date }): string[];
