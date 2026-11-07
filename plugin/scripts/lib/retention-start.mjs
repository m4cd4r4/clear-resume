// Rule 3 (docs/no-bloat/PROJECT-PLAN.md): SessionStart starts the retention job and
// returns at once. One small read decides; the work runs in a detached node that
// outlives the hook (scripts/retention.mjs), so session start does not grow with the
// relay folder. Spawned as the store sync's background push is (packages/store/sync.mjs).
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveStore } from "../../packages/store/rename.mjs";
import { MARKER, isDue } from "../../packages/store/relay-retention.mjs";

const JOB = join(dirname(fileURLToPath(import.meta.url)), "..", "retention.mjs");

/** The job's process when it was due and started, else null. Never throws. */
export function startRetention({ store = resolveStore(), now = Date.now(), spawnFn = spawn } = {}) {
  try {
    let text;
    try {
      text = readFileSync(join(store, "relay", MARKER), "utf8");
    } catch (e) {
      // No marker yet is due; no relay folder at all (the relay never ran) is nothing to clean.
      if (e?.code !== "ENOENT" || !existsSync(join(store, "relay"))) return null;
      text = "";
    }
    if (!isDue(text, now)) return null;
    const child = spawnFn(process.execPath, [JOB], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      // Inside VS Code, process.execPath is the editor itself; this runs it as node.
      env: { ...process.env, CORNERMAN_HOME: store, ELECTRON_RUN_AS_NODE: "1" },
    });
    child.unref();
    return child;
  } catch {
    return null;
  }
}
