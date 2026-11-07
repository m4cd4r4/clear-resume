#!/usr/bin/env node
// /cornerman:stats (docs/no-bloat/PROJECT-PLAN.md, wave 3): this month's relay windows
// by repo, and last month on one line, from the ledger and the live relay files.
// Reads only; the store is CORNERMAN_HOME or ~/.cornerman, as for every other script.
import { resolveStore } from "../packages/store/rename.mjs";
import { ledgerMonth } from "../packages/store/relay-retention.mjs";
import { previousMonth, readRelayStats, statsText } from "../packages/store/relay-stats.mjs";

const now = Date.now();
const month = ledgerMonth(now);
try {
  // Two ledger files are all the output shows; every live file is read, since one can move a window between months.
  process.stdout.write(statsText(readRelayStats({ store: resolveStore(), months: [month, previousMonth(month)] }), now));
} catch (e) {
  process.stdout.write(`cornerman stats: could not read the store (${String(e?.message ?? e)}).\n`);
}
