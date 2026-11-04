const fs = require('fs');
const files = process.argv.slice(2);
const agg = {};
for (const f of files) {
  const p = JSON.parse(fs.readFileSync(f, 'utf8'));
  const dt = {};
  p.samples.forEach((s, i) => { dt[s] = (dt[s] || 0) + (p.timeDeltas[i] || 0); });
  for (const n of p.nodes) {
    const t = (dt[n.id] || 0) / 1000;
    if (!t) continue;
    const cf = n.callFrame;
    const k = `${cf.functionName || '(anon)'} ${cf.url.replace(/.*extensions[\\/]/, '').slice(-90)}:${cf.lineNumber}`;
    agg[k] = (agg[k] || 0) + t;
  }
}
Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(v.toFixed(0) + 'ms', k));
