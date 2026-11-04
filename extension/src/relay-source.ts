// The relay mod's per-window files (<store>/relay/<key>.json), as the status bar reads
// them every 5 s poll. No vscode import, so vitest times a poll against a fixture folder.
// The folder is never cleaned up (1,366 files on 2026-11-04), and reading all of it
// synchronously on every poll held the shared extension host for most of a second.
import type { RelayFile } from "../../plugin/packages/store/relay-state.mjs";
import { JsonFolder } from "./json-folder";

// <key>.json only: <key>.set.json, .nudge.json, .idle.json and .handover.json are the status bar's own asks.
const isRelayFile = (n: string) => /^[^.]+\.json$/.test(n);

export class RelaySource {
  private readonly folder: JsonFolder<RelayFile>;

  constructor(dir: () => string) {
    this.folder = new JsonFolder(dir, isRelayFile, (json) => (json && typeof json === "object" ? (json as RelayFile) : null));
  }

  /** Every relay file that parses, as of the last change the watcher reported. */
  async files(): Promise<RelayFile[]> {
    await this.folder.update();
    return this.folder.values();
  }

  /** A watcher saw `path` change; with no path, anything may have. */
  changed(path?: string): void {
    this.folder.changed(path);
  }
}
