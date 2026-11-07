#!/usr/bin/env node
// The relay retention job (docs/no-bloat/PROJECT-PLAN.md, wave 2, rule 3). SessionStart
// starts it detached when the marker is a day old (lib/retention-start.mjs) and returns
// at once; this process does the work and prints one JSON report.
//
// Several sessions starting together each start one. They queue on a mkdir lock (mkdir
// either makes the folder or fails, on every filesystem), and the one inside re-reads
// the marker, so the others find it fresh and stop: one run a day.
//
//   node retention.mjs                      the daily run, against the real store
//   node retention.mjs --dry-run [--relay <dir>] [--sessions <dir>]
//                                           list what would go; writes nothing, takes no lock
import { mkdirSync, readFileSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveStore } from "../packages/store/rename.mjs";
import { LOCK, MARKER, isDue, pruneRelay } from "../packages/store/relay-retention.mjs";
import { configDir } from "./lib/upgrade.mjs";

/** A lock older than this was left by a run that died; the next one takes it over. */
const STALE_LOCK_MS = 10 * 60_000;

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const store = resolveStore();
const relayDir = arg("--relay") ?? join(store, "relay");
const sessionsDir = arg("--sessions") ?? join(configDir(), "sessions");
const ledgerDir = join(store, "ledger");
const print = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const marker = () => {
  try {
    return readFileSync(join(relayDir, MARKER), "utf8");
  } catch {
    return "";
  }
};

function takeLock(path) {
  for (let tries = 0; tries < 2; tries++) {
    try {
      mkdirSync(path);
      return true;
    } catch (e) {
      if (e?.code !== "EEXIST") return false;
      try {
        if (Date.now() - statSync(path).mtimeMs < STALE_LOCK_MS) return false;
        rmdirSync(path);
      } catch {
        // another run took it over first
      }
    }
  }
  return false;
}

function main() {
  const now = Date.now();
  if (process.argv.includes("--dry-run")) {
    print({ dryRun: true, relayDir, sessionsDir, ...pruneRelay({ relayDir, sessionsDir, ledgerDir, now, dryRun: true }) });
    return;
  }
  const lock = join(relayDir, LOCK);
  if (!isDue(marker(), now) || !takeLock(lock)) return print({ ran: false });
  try {
    // Inside the lock: a run that finished while this one waited has written a fresh marker.
    if (!isDue(marker(), now)) return print({ ran: false });
    // Claimed before the work, so a run that dies is retried tomorrow, not at every start.
    writeFileSync(join(relayDir, MARKER), `${now} ${process.pid}\n`);
    const r = pruneRelay({ relayDir, sessionsDir, ledgerDir, now });
    print({ ran: true, ...r, due: r.due.length });
  } finally {
    try {
      rmdirSync(lock);
    } catch {
      // gone already
    }
  }
}

try {
  main();
} catch (e) {
  print({ ran: false, error: String(e?.message ?? e) });
}
