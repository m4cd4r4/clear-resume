// The sidebar's "This month" (docs/no-bloat/PROJECT-PLAN.md, wave 3), from this month's
// ledger file and the relay windows the status bar already holds. No vscode import, so
// vitest times it against a fixture store.
//
// The ledger is not re-read on every store change: the file is stat'd only after a
// watcher (or the minute rescan) says the ledger folder changed, and read again only
// when its size or mtime moved. A window is counted under the month of its last
// change, so only this month's file can hold one of this month's windows.
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { ledgerMonth, ledgerWindows, liveWindows, relayStats, thisMonth, type StatWindow, type ThisMonth } from "../../plugin/packages/store/relay-stats.mjs";

type Cached = { path: string; mtimeMs: number; size: number; rows: StatWindow[] };

export class MonthSource {
  private dirty = true;
  private cached: Cached | null = null;
  // The last answer and what it was worked out from. The relay folder hands back the
  // same object per file until that file changes, so an unchanged folder is the same
  // objects in the same order, and the answer is reused instead of counted again.
  private last: { month: string; rows: StatWindow[]; files: unknown[]; section: ThisMonth | undefined } | null = null;
  /** How many times a ledger file was read: the test counts these. */
  reads = 0;

  constructor(
    private readonly ledgerDir: () => string,
    private readonly relayFiles: () => Promise<unknown[]>,
  ) {}

  /** The watcher saw the ledger folder change. */
  changed(): void {
    this.dirty = true;
  }

  /** This month's line of counts and top repos, or undefined when it has no window. */
  async section(now: number): Promise<ThisMonth | undefined> {
    const [rows, files] = await Promise.all([this.ledger(now), this.relayFiles().catch(() => [] as unknown[])]);
    const month = ledgerMonth(now);
    const l = this.last;
    if (l && l.month === month && l.rows === rows && l.files.length === files.length && l.files.every((f, i) => f === files[i])) return l.section;
    const section = thisMonth(relayStats({ parsed: [rows], live: liveWindows(files) }), now);
    this.last = { month, rows, files: files.slice(), section };
    return section;
  }

  private async ledger(now: number): Promise<StatWindow[]> {
    const path = join(this.ledgerDir(), `${ledgerMonth(now)}.jsonl`);
    // A new month, or a moved store, names another file.
    if (!this.dirty && this.cached?.path === path) return this.cached.rows;
    this.dirty = false;
    let s;
    try {
      s = await stat(path);
    } catch {
      if (this.cached?.path !== path || this.cached.size) this.cached = { path, mtimeMs: 0, size: 0, rows: [] };
      return this.cached.rows;
    }
    const hit = this.cached;
    if (hit && hit.path === path && hit.mtimeMs === s.mtimeMs && hit.size === s.size) return hit.rows;
    let rows: StatWindow[] = [];
    try {
      this.reads++;
      rows = ledgerWindows(await readFile(path, "utf8"));
    } catch {
      // Unreadable: counted as empty until it changes again.
    }
    this.cached = { path, mtimeMs: s.mtimeMs, size: s.size, rows };
    return rows;
  }
}
