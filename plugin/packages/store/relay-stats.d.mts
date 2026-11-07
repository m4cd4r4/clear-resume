/** One window as the stats count it, from a ledger line or a live relay file. */
export interface StatWindow {
  key: string;
  repo: string;
  sessions: number;
  relays: number;
  at: number;
}

export interface RepoStats {
  windows: number;
  sessions: number;
  relays: number;
}

/** Month (`YYYY-MM`, local time) -> repo -> counts. */
export type RelayStats = Map<string, Map<string, RepoStats>>;

export interface ThisMonth {
  /** "41 windows · 128 relays · 9 repos". */
  counts: string;
  /** At most three repos, most relays first. */
  top: { repo: string; relays: string }[];
}

/** `YYYY-MM` of `ms`, local time. */
export function ledgerMonth(ms: number): string;
export function ledgerWindows(text: string): StatWindow[];
export function liveWindow(w: { key: string; cwd?: string; sessions: string[]; used?: number; updatedAt: number }): StatWindow;
export function relayStats(input: { ledgers?: string[]; parsed?: StatWindow[][]; live?: { key: string; cwd?: string; sessions: string[]; used?: number; updatedAt: number }[] }): RelayStats;
export function monthRows(stats: RelayStats, month: string): { repos: ({ repo: string } & RepoStats)[]; total: RepoStats };
export function previousMonth(month: string): string;
export function monthName(month: string): string;
export function plural(n: number, word: string): string;
export const TOP_REPOS: number;
export function thisMonth(stats: RelayStats, now: number): ThisMonth | undefined;
export function statsText(stats: RelayStats, now: number): string;
export function ledgerFiles(ledgerDir: string): string[];
export function readRelayStats(opts: { store: string; months?: string[] }): Promise<RelayStats>;
export function liveWindows<T>(files: T[]): (T & { key: string; sessions: string[]; updatedAt: number })[];
