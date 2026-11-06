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
import { FOLDER, NOW, SESSIONS, body, buildRelay, buildStore, cpuYardstick, longestBlock, relayFile } from "./fixtures/big-store.mjs";

const BUDGET_MS = 50;
// The best of three passes. One pass measures every other process on the machine too: under
// load a single pass read 64.6 ms (2026-11-06, issue #178). A real regression, like the 182 ms
// and 800 ms before the fix, is slow on every pass.
const PASSES = 3;
async function bestBlock(pass) {
  let best = Infinity;
  for (let i = 0; i < PASSES; i++) best = Math.min(best, await pass(i));
  return best;
}
// Best of three still failed at 51.4 ms in a run that took twice its usual time (2026-11-06): the
// refresh is CPU-bound, so every pass on a contended CPU is slow. The budget scales by how slow a
// fixed piece of CPU work is right now against the same work on a quiet machine (about 8 ms on
// Macdara's desk, 2-2.7x that under 20 busy-loop processes, in step with the refresh's 25 to
// 51-64 ms). The smaller of two readings is used, never below 1x and never above 4x, so the 182 ms
// freeze still fails on a quiet machine and anything past 200 ms fails on any machine.
const QUIET_YARDSTICK_MS = 8;
async function budgetedBlock(pass) {
  const before = cpuYardstick();
  const ms = await bestBlock(pass);
  const scale = Math.min(4, Math.max(1, Math.min(before, cpuYardstick()) / QUIET_YARDSTICK_MS));
  return { ms, budget: BUDGET_MS * scale };
}

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
    let after;
    const { ms, budget } = await budgetedBlock(async (i) => {
      writeFileSync(one, JSON.stringify({ schema: 1, title: `New one ${i}`, body: body(9999), repoPath: FOLDER, machine: "box", pid: "9999", createdAt: NOW.toISOString(), status: "waiting", sessionId: SESSIONS[0] }));
      source.changed(one);
      return longestBlock(async () => (after = await refresh()));
    });
    console.log(`sidebar refresh: longest block ${ms.toFixed(1)} ms, budget ${budget.toFixed(0)} ms`);
    expect(rowCount(after)).toBe(rowCount(first) + 1);
    expect(ms).toBeLessThan(budget);
  });

  it("status-bar poll of 1,400 relay files, after one is rewritten", async () => {
    // The real relay folder on 2026-11-04: 1,366 window files, never cleaned up, read every 5 s.
    const dir = join(root, "relay");
    buildRelay(dir);
    const source = new RelaySource(() => dir);
    expect((await source.files()).length).toBe(1400);
    let files;
    const { ms, budget } = await budgetedBlock(async () => {
      writeFileSync(join(dir, "k0.json"), JSON.stringify(relayFile(0, 4)));
      source.changed(join(dir, "k0.json"));
      return longestBlock(async () => (files = await source.files()));
    });
    console.log(`relay poll: longest block ${ms.toFixed(1)} ms, budget ${budget.toFixed(0)} ms`);
    expect(files.find((f) => f.key === "k0").used).toBe(4);
    expect(ms).toBeLessThan(budget);
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
