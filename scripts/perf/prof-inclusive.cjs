// Inclusive (self + children) time per function in .cpuprofile files, filtered to
// frames whose url matches a pattern (default: cornerman). Shows which of our
// functions a stall is spent under, where prof.cjs shows only where the CPU sat.
//   node scripts/perf/prof-inclusive.cjs [--match cornerman] <files...>
const fs = require("fs");
const args = process.argv.slice(2);
let match = "cornerman";
const mi = args.indexOf("--match");
if (mi >= 0) [, match] = args.splice(mi, 2);
const agg = {};
for (const f of args) {
  const p = JSON.parse(fs.readFileSync(f, "utf8"));
  const parent = {};
  const byId = {};
  for (const n of p.nodes) {
    byId[n.id] = n;
    for (const c of n.children || []) parent[c] = n.id;
  }
  const dt = {};
  p.samples.forEach((s, i) => (dt[s] = (dt[s] || 0) + (p.timeDeltas[i] || 0)));
  for (const [id, us] of Object.entries(dt)) {
    const seen = new Set();
    for (let cur = Number(id); cur !== undefined; cur = parent[cur]) {
      const cf = byId[cur].callFrame;
      if (!cf.url.includes(match)) continue;
      const k = `${cf.functionName || "(anon)"} :${cf.lineNumber}`;
      if (seen.has(k)) continue;
      seen.add(k);
      agg[k] = (agg[k] || 0) + us / 1000;
    }
  }
}
Object.entries(agg)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25)
  .forEach(([k, v]) => console.log(`${v.toFixed(0)}ms`, k));
