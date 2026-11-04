// What the sidebar and the status bar read from the store. No vscode import, so
// vitest runs it against a fixture store and times a refresh.
//
// The records live in memory and a refresh rereads only the files the store watcher
// named. Before this, every refresh stat'd all ~2,000 handover files with statSync
// and held the shared extension host for 180 ms; with several refreshes per store
// write in every window, the host froze for seconds and the Claude Code panel said it
// had stopped responding (2026-11-04).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StoredHandover } from "../../plugin/packages/store/store.mjs";
import { normalise } from "../../plugin/packages/store/schema.mjs";
import { artifactsDir, validSessionId, type Capture } from "../../plugin/packages/store/artifacts.mjs";
import { JsonFolder } from "./json-folder";

export interface Snapshot {
  /** Newest first, tombstones left out: what listAll returns. */
  records: StoredHandover[];
  /** Each session's capture, by session id. */
  captures: Map<string, Capture>;
}

export class StoreSource {
  private readonly handovers: JsonFolder<StoredHandover>;
  private readonly root: () => string;
  private current: Snapshot = { records: [], captures: new Map() };
  private capturesByText = new Map<string, Capture>();

  constructor(root: () => string) {
    this.root = root;
    this.handovers = new JsonFolder(
      () => join(root(), "handovers"),
      (n) => n.endsWith(".json"),
      (json, path) => ({ ...normalise(json as Parameters<typeof normalise>[0]), path }) as StoredHandover,
    );
  }

  /** Every record and capture, as of the last change the watcher reported. A record stays the same object until its file changes. */
  async snapshot(): Promise<Snapshot> {
    // One at a time, so a second caller never takes the old snapshot while the first builds the new one.
    while (this.pending) await this.pending;
    this.pending = this.build().finally(() => (this.pending = null));
    return this.pending;
  }

  private pending: Promise<Snapshot> | null = null;

  private async build(): Promise<Snapshot> {
    if (!(await this.handovers.update())) return this.current;
    const records = this.handovers.values().filter((r) => r.status !== "deleted");
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    this.current = { records, captures: await this.readCaptures() };
    return this.current;
  }

  /** The watcher saw `path` change. With no path anything may have, and the next snapshot rescans the store. */
  changed(path?: string): void {
    this.handovers.changed(path);
  }

  // Each capture's meta.json (artifacts/<session>/), read without blocking whenever a
  // handover changes: a hook writes the capture in the same save. One that reads the same as last
  // time keeps its object, so rows keyed on it stay cached.
  private async readCaptures(): Promise<Map<string, Capture>> {
    const dir = artifactsDir(this.root());
    const names = (await readdir(dir).catch(() => [] as string[])).filter(validSessionId);
    const out = new Map<string, Capture>();
    const known = new Map<string, Capture>();
    for (let i = 0; i < names.length; i += 32) {
      const texts = await Promise.all(names.slice(i, i + 32).map((n) => readFile(join(dir, n, "meta.json"), "utf8").catch(() => "")));
      texts.forEach((text) => {
        let capture = this.capturesByText.get(text) ?? null;
        if (!capture) {
          try {
            const meta = JSON.parse(text);
            capture = meta && Array.isArray(meta.items) && validSessionId(meta.sessionId) ? (meta as Capture) : null;
          } catch {
            capture = null;
          }
        }
        if (!capture) return;
        known.set(text, capture);
        out.set(capture.sessionId, capture);
      });
    }
    this.capturesByText = known;
    return out;
  }
}
