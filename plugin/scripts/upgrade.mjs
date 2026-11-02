#!/usr/bin/env node
// Finishes the move from the old plugin name: copies its options and says what is left.
//   node upgrade.mjs
import { configDir, upgradeReport, upgradeSettings } from "./lib/upgrade.mjs";

process.stdout.write(`${upgradeReport(upgradeSettings(), configDir())}\n`);
