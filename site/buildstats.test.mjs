// Checks buildstats.mjs on the fixture, and that a relayed session opening with a
// <command-name>/clear</command-name> record (as every real one does) still counts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collect, measure, isDone } from "./buildstats.mjs";

const SITE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(SITE, "source", "fixture");
const TMP = path.join(SITE, ".tmp-buildstats");
const SINCE = "2026-10-04T02:35:00Z";
let fail = 0;
const check = (name, ok) => { console.log((ok ? "ok   " : "FAIL ") + name); if (!ok) fail++; };

const t = measure(collect(FIX, SINCE)).totals;
check("fixture: 9 sessions", t.sessions === 9);
check("fixture: 8 clears", t.clears === 8);
check("fixture: 52.8 minutes", t.minutes === "52.8");
check("fixture: 50.2M tokens", t.tokens === "50.2M");

const say = (text) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
check("done: bare marker", isDone(say("RELAY-SITE-DONE")));
check("done: marker then a summary", isDone(say("RELAY-SITE-DONE\n\nAll 30 items ticked.")));
check("done: a mention is not the end", !isDone(say("Finish line: reply RELAY-SITE-DONE when PLAN.md is ticked.")));

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP);
try {
  for (const f of fs.readdirSync(FIX)) fs.copyFileSync(path.join(FIX, f), path.join(TMP, f));
  const target = "bbba47ba-c0ad-4e89-bf68-ab961aab78b5.jsonl";
  const p = path.join(TMP, target);
  const lines = fs.readFileSync(p, "utf8").split("\n");
  const ts = JSON.parse(lines[0]).timestamp;
  const wrap = [
    { type: "user", timestamp: ts, message: { role: "user", content: "<command-name>/clear</command-name>" } },
    { type: "user", timestamp: ts, isMeta: true, message: { role: "user", content: "Caveat: meta record" } },
    { type: "user", timestamp: ts, message: { role: "user", content: "  <local-command-stdout></local-command-stdout>" } },
  ].map((r) => JSON.stringify(r));
  fs.writeFileSync(p, wrap.concat(lines).join("\n"));
  const t2 = measure(collect(TMP, SINCE)).totals;
  check("wrapped /clear record: still 9 sessions", t2.sessions === 9);
  check("wrapped /clear record: same tokens", t2.tokens === t.tokens);
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}
process.exit(fail ? 1 : 0);
