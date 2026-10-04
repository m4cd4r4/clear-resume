/** The relay mod's state file, <store>/relay/<key>.json (plugin/hooks/relay.ts). */
export interface RelayFile {
  v: 1;
  key: string;
  cwd: string;
  sessions: string[];
  limit: number | "unlimited";
  configured: number | "unlimited";
  used: number;
  stalled: number;
  applied: number;
  updatedAt: number;
}

/** What the status bar writes to <key>.set.json. */
export interface RelaySet {
  limit: string;
  at: number;
}

export interface Effective {
  limit: number;
  used: number;
  pending: boolean;
}

export interface Usage {
  partial: string;
  seen: Set<string>;
  calls: number;
  sum: number;
  first: number | null;
  last: number | null;
}

export interface ChainTotals {
  sessions: number;
  /** Main-thread assistant calls across the chain. */
  replies: number;
  tokens: number;
  saved: number;
}

/** One of Claude Code's ~/.claude/sessions/<pid>.json records, the fields read here. */
export interface LiveSession {
  pid: number;
  sessionId: string;
  cwd?: string;
  procStart?: string;
  updatedAt?: number;
}

export interface WindowSessions {
  /** This window's live session ids, newest first. */
  mine: string[];
  /** Live session ids another window holds. */
  theirs: string[];
}

export function liveSessions(records: LiveSession[], owned: (record: LiveSession) => boolean | null): WindowSessions;
export function pickWindow(files: RelayFile[], roots: string[], sessions?: Partial<WindowSessions>): RelayFile | null;
export function projectDirName(cwd: string): string;
export function newUsage(): Usage;
export function feedUsage(u: Usage, text: string): Usage;
export function chainTotals(sessions: Pick<Usage, "calls" | "sum" | "first" | "last">[]): ChainTotals;
export function k(n: number): string;
export function pie(context: number, threshold: number): { text: string; level: "ok" | "warn" | "over"; bar: string };
export function relayText(r: { limit: number; used: number }): string;
export function picks(current: number): { label: string; limit: string; current: boolean }[];
export function hoverText(opts: {
  context: number;
  threshold: number;
  relay: Effective | null;
  totals: ChainTotals;
  links: { handover?: string; log?: string };
}): string;
export function budget(raw: unknown): number;
export function effective(file: RelayFile, set: RelaySet | null | undefined): Effective;
