// Drive the extension host's refresh path outside VS Code, so a CPU profile of it can
// be taken before and after a change without launching an Extension Development Host.
//
//   node --cpu-prof --cpu-prof-dir=<dir> scripts/perf/refresh-profile.mjs <checkout> [--home <dir>]
//
// <checkout> is a checkout of this repo (a worktree of origin/main for "before").
// Its own sidebar and store code is loaded. Without extension/src/store-source.ts (the
// code before 2026-11-04), a refresh is what sidebar.ts did then: listAll, listCaptures
// and the model, posted as an object, and the status bar's relay read. With it, the
// in-memory sources. Each iteration writes one handover and one relay file, as a hook
// and the relay mod do, then refreshes once and polls once.
//
// The store is a fixture the size of the real one, under a sandbox home (default
// I:/Scratch/_plugin-dev/perf-home), never the real ~/.cornerman. Aggregate the
// profile with scripts/perf/prof.cjs or prof-inclusive.cjs.
import { existsSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FOLDER, NOW, SESSIONS, body, buildRelay, buildStore, longestBlock, relayFile } from "../../test/fixtures/big-store.mjs";

// extension/src imports its own modules without an extension, as esbuild resolves them.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const args = process.argv.slice(2);
const hi = args.indexOf("--home");
const HOME = resolve(hi >= 0 ? args.splice(hi, 2)[1] : "I:/Scratch/_plugin-dev/perf-home");
const tree = resolve(args[0] ?? ".");
const ITERATIONS = 20;

// homedir() reads these, so the store resolves under the sandbox exactly as it would under ~.
process.env.USERPROFILE = HOME;
process.env.HOME = HOME;
delete process.env.CORNERMAN_HOME;
delete process.env.CLEAR_RESUME_HOME;
const store = join(HOME, ".cornerman");
if (!existsSync(join(store, "handovers"))) {
  buildStore(store);
  buildRelay(join(store, "relay"), 1366);
}

const load = (rel) => import(pathToFileURL(join(tree, rel)).href);
const model = await load("extension/src/sidebar-model.ts");
const { storeRoot, listAll } = await load("plugin/packages/store/store.mjs");
const after = existsSync(join(tree, "extension/src/store-source.ts"));
if (storeRoot() !== store) throw new Error(`store resolved to ${storeRoot()}, not the sandbox`);

let refresh, poll, touched;
const opts = () => ({ repoPath: FOLDER, roots: [FOLDER], now: new Date(NOW.getTime() + 60_000), showArchived: true });
if (after) {
  const { StoreSource } = await load("extension/src/store-source.ts");
  const { RelaySource } = await load("extension/src/relay-source.ts");
  const source = new StoreSource(() => store);
  const relay = new RelaySource(() => join(store, "relay"));
  touched = (h, r) => (source.changed(h), relay.changed(r));
  refresh = async () => {
    const { records, captures } = await source.snapshot();
    const sections = model.filterSections(model.handoverSections(records, { ...opts(), captures }), "");
    JSON.stringify({ type: "model", json: model.pageJson({ section: "handovers", query: "", hasLegacy: false, sections }) });
  };
  poll = () => relay.files();
} else {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { listCaptures } = await load("plugin/packages/store/artifacts.mjs");
  touched = () => {};
  refresh = async () => {
    const records = listAll(storeRoot());
    const captures = new Map(listCaptures(storeRoot()).map((c) => [c.sessionId, c]));
    const sections = model.filterSections(model.handoverSections(records, { ...opts(), captures }), "");
    JSON.stringify({ type: "model", model: { section: "handovers", query: "", hasLegacy: false, sections } });
  };
  const relayDir = () => join(storeRoot(), "relay");
  poll = async () =>
    readdirSync(relayDir())
      .filter((n) => n.endsWith(".json") && !n.endsWith(".set.json") && !n.endsWith(".handover.json"))
      .map((n) => JSON.parse(readFileSync(join(relayDir(), n), "utf8")));
}

await refresh();
await poll();
const blocks = { refresh: [], poll: [] };
for (let i = 0; i < ITERATIONS; i++) {
  const h = join(store, "handovers", `box-77${i}-perf.json`);
  writeFileSync(h, JSON.stringify({ schema: 1, title: `Perf ${i}`, body: body(i), repoPath: FOLDER, machine: "box", pid: `77${i}`, createdAt: NOW.toISOString(), status: "waiting", sessionId: SESSIONS[0] }));
  const r = join(store, "relay", "k0.json");
  writeFileSync(r, JSON.stringify(relayFile(0, i)));
  touched(h, r);
  blocks.refresh.push(await longestBlock(refresh));
  blocks.poll.push(await longestBlock(poll));
}
const stat = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return `median ${s[s.length >> 1].toFixed(1)} ms, max ${s[s.length - 1].toFixed(1)} ms`;
};
console.log(`${after ? "after" : "before"} (${tree}), ${ITERATIONS} iterations, longest event-loop block:`);
console.log(`  sidebar refresh: ${stat(blocks.refresh)}`);
console.log(`  relay poll:      ${stat(blocks.poll)}`);
