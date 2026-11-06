// The extension host is shared by every extension in the window. cornerman froze it
// for 2 to 4 s at a time (2026-11-04): VS Code's profiler blamed it 38 times in a day
// and the Claude Code panel showed "stopped responding". PR #160 cached one function
// and shipped without measuring, so the freeze survived. These tests measure the
// longest stretch the event loop is held during a refresh, on a store the size of the
// real one, and fail above 50 ms. On main before the fix: 182 ms and 800 ms.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StoreSource } from "../extension/src/store-source.ts";
import { RelaySource } from "../extension/src/relay-source.ts";
import { filterSections, handoverSections, pageJson } from "../extension/src/sidebar-model.ts";
import { forgetWorktrees, worktreePathsAsync } from "../plugin/packages/store/worktree.mjs";
import { FOLDER, NOW, SESSIONS, body, buildRelay, buildStore, longestBlock, relayFile } from "./fixtures/big-store.mjs";

const BUDGET_MS = 50;

let root;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "cm-block-"));
  buildStore(root);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("one refresh never holds the extension host", () => {
  it("sidebar refresh on a 2,000-handover store, after a store write", async () => {
    const source = new StoreSource(() => root);
    const refresh = async () => {
      const { records, captures } = await source.snapshot();
      const sections = filterSections(handoverSections(records, { repoPath: FOLDER, roots: [FOLDER], now: NOW, showArchived: true, captures }), "");
      // What sidebar.ts posts, and postMessage's own serialisation of it: both run on the host.
      JSON.stringify({ type: "model", json: pageJson({ section: "handovers", query: "", hasLegacy: false, sections }) });
      return sections;
    };
    const rowCount = (sections) => sections.flatMap((s) => (s.groups ? s.groups.flatMap((g) => g.rows) : s.rows)).length;
    const first = await refresh();
    // A hook writes one handover: the watcher fires, the sidebar refreshes.
    const one = join(root, "handovers", `box-9999-${NOW.toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(one, JSON.stringify({ schema: 1, title: "New one", body: body(9999), repoPath: FOLDER, machine: "box", pid: "9999", createdAt: NOW.toISOString(), status: "waiting", sessionId: SESSIONS[0] }));
    source.changed(one);
    let after;
    const ms = await longestBlock(async () => (after = await refresh()));
    console.log(`sidebar refresh: longest block ${ms.toFixed(1)} ms`);
    expect(rowCount(after)).toBe(rowCount(first) + 1);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("status-bar poll of 1,400 relay files, after one is rewritten", async () => {
    // The real relay folder on 2026-11-04: 1,366 window files, never cleaned up, read every 5 s.
    const dir = join(root, "relay");
    buildRelay(dir);
    const source = new RelaySource(() => dir);
    expect((await source.files()).length).toBe(1400);
    writeFileSync(join(dir, "k0.json"), JSON.stringify(relayFile(0, 4)));
    source.changed(join(dir, "k0.json"));
    let files;
    const ms = await longestBlock(async () => (files = await source.files()));
    console.log(`relay poll: longest block ${ms.toFixed(1)} ms`);
    expect(files.find((f) => f.key === "k0").used).toBe(4);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("first worktree lookup for a folder, which runs git", async () => {
    const main = join(root, "wt-repo");
    mkdirSync(main);
    const git = (...args) => execFileSync("git", args, { cwd: main, stdio: "ignore" });
    git("init", "-q", "-b", "main");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
    git("worktree", "add", "-q", "-b", "side", join(root, "wt-side"));
    forgetWorktrees();
    let paths;
    const ms = await longestBlock(async () => (paths = await worktreePathsAsync(main)));
    console.log(`first worktree lookup: longest block ${ms.toFixed(1)} ms`);
    expect(paths).toHaveLength(2);
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
