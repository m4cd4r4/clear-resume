#!/usr/bin/env node
// The runner's --alert-cmd in tests: writes the alert text where the test can read it.
import { writeFileSync } from "node:fs";

writeFileSync(process.env.FAKE_ALERT_OUT, process.env.CLEAR_RESUME_ALERT ?? "", "utf8");
