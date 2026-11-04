// A folder of JSON files kept in memory, read without blocking the extension host.
// The first read takes the whole folder; after that only the files a watcher named
// are read again. Both the handover store and the relay folder hold thousands of
// files, and reading them all synchronously on every refresh and every 5 s poll froze
// the shared extension host for seconds at a time (2026-11-04).
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

// Windows paths compare without case: a watcher's Uri.fsPath lower-cases the drive letter.
const same = (a: string, b: string) => (process.platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));

// Open at most this many files at once: a first read of 2,000 would otherwise ask for 2,000 handles.
const BATCH = 32;

type Entry<T> = { mtimeMs: number; size: number; value: T | null };

export class JsonFolder<T> {
  private entries = new Map<string, Entry<T>>();
  private dirty = new Set<string>();
  private full = true;
  private seenDir = "";
  private loading: Promise<boolean> | null = null;
  private readonly dir: () => string;
  private readonly accept: (name: string) => boolean;
  private readonly parse: (json: unknown, path: string) => T | null;

  /** `parse` returns null, or throws, for a file to leave out. */
  constructor(dir: () => string, accept: (name: string) => boolean, parse: (json: unknown, path: string) => T | null) {
    this.dir = dir;
    this.accept = accept;
    this.parse = parse;
  }

  /** The watcher saw `path` change. With no path anything may have, and the next read rescans the folder. */
  changed(path?: string): void {
    if (path) this.dirty.add(path);
    else this.full = true;
  }

  /**
   * Bring the folder up to date. True when any value changed. A value stays the same
   * object until its file changes, so callers can key caches on it.
   */
  async update(): Promise<boolean> {
    let touched = false;
    // A change that lands while a read runs is taken by the next one, not dropped.
    for (;;) {
      if (this.loading) touched = (await this.loading) || touched;
      else if (this.full || this.dirty.size || this.dir() !== this.seenDir) this.loading = this.load().finally(() => (this.loading = null));
      else return touched;
    }
  }

  /** Every value that parsed, as of the last update. */
  values(): T[] {
    const out: T[] = [];
    for (const e of this.entries.values()) if (e.value !== null) out.push(e.value);
    return out;
  }

  private async load(): Promise<boolean> {
    const dir = this.dir();
    let touched = false;
    if (dir !== this.seenDir) {
      touched = this.entries.size > 0;
      this.entries.clear();
      this.full = true;
      this.seenDir = dir;
    }
    let paths: string[];
    if (this.full) {
      this.full = false;
      this.dirty.clear();
      const names = await readdir(dir).catch(() => [] as string[]);
      paths = names.filter(this.accept).map((n) => join(dir, n));
      const listed = new Set(paths);
      for (const p of this.entries.keys()) if (!listed.has(p)) touched = this.entries.delete(p) || touched;
    } else {
      // Keyed by this folder's own spelling of the path, whatever the watcher's was.
      paths = [...this.dirty].filter((p) => same(dirname(p), dir) && this.accept(basename(p))).map((p) => join(dir, basename(p)));
      this.dirty.clear();
    }
    for (let i = 0; i < paths.length; i += BATCH) {
      const results = await Promise.all(paths.slice(i, i + BATCH).map((p) => this.reread(p)));
      touched = results.some(Boolean) || touched;
    }
    return touched;
  }

  /** Read one file again if its size or mtime moved. True when the entry changed. */
  private async reread(path: string): Promise<boolean> {
    let s;
    try {
      s = await stat(path);
    } catch {
      return this.entries.delete(path);
    }
    const hit = this.entries.get(path);
    if (hit && hit.mtimeMs === s.mtimeMs && hit.size === s.size) return false;
    let value: T | null = null;
    try {
      value = this.parse(JSON.parse(await readFile(path, "utf8")), path);
    } catch {
      // Unreadable or half-written: left out until it is written again.
    }
    this.entries.set(path, { mtimeMs: s.mtimeMs, size: s.size, value });
    return true;
  }
}
