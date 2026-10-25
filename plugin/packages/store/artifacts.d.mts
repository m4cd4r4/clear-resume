export type ArtifactKind = "table" | "list" | "link" | "path";

export interface ArtifactItem {
  kind: ArtifactKind;
  title: string;
  text: string;
  /** Assistant replies from the end: 1 is the last thing said before the clear. */
  back: number;
}

export interface Capture {
  sessionId: string;
  repoPath: string;
  capturedAt: string;
  counts: Record<ArtifactKind, number>;
  items: ArtifactItem[];
  hasLastScreen: boolean;
}

export const KINDS: readonly ArtifactKind[];
export function validSessionId(id: unknown): boolean;
export function artifactsDir(root: string): string;
export function captureDir(root: string, sessionId: string): string;
export function summary(counts: Partial<Record<ArtifactKind, number>> | undefined): string;
export function countItems(items: { kind: string }[]): Record<ArtifactKind, number>;
export function artifactsMarkdown(capture: { sessionId: string; capturedAt: string; repoPath?: string; items: ArtifactItem[] }): string;
export function writeCapture(
  root: string,
  capture: { sessionId: string; repoPath?: string; capturedAt: string; items: Omit<ArtifactItem, "back">[] & { back?: number }[]; lastScreen?: string },
): string | null;
export function readCapture(root: string, sessionId: string): Capture | null;
export function listCaptures(root: string): Capture[];
export function pruneCaptures(opts: { root: string; now?: Date; keep?: Set<string> }): string[];
