// Checks site/model.js against the TASK.md "Model spec" cases. Prints ok / FAIL per case.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

vm.runInThisContext(readFileSync(new URL('./model.js', import.meta.url), 'utf8'));
const M = globalThis.crModel;

let failed = 0;
function check(n, name, fn) {
  let pass = false, note = '';
  try { pass = fn(); } catch (e) { note = ' (' + e.message + ')'; }
  if (!pass) failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${n}. ${name}${note}`);
}

const small = M.run({ window: 1000000, start: 20000, clearAt: 100000, work: 400000 });
const defaults = { window: 1000000, start: 21000, clearAt: 180000, work: 2000000 };
const def = M.run(defaults);
const big = M.run({ ...defaults, start: 85000 });

check(1, 'start 20k, clearAt 100k, work 400k: clear resets 5 times', () => small.clear.resets === 5);
check(2, 'same: clear peaks at exactly 100k', () => small.clear.peak === 100000);
check(3, 'same: both runs make 80 replies', () => small.clear.replies === 80 && small.base.replies === 80);
check(4, 'same: first stretch reread = 25k + 30k + ... + 100k', () => {
  let want = 0;
  for (let c = 25000; c <= 100000; c += 5000) want += c;
  let got = 0;
  const pts = small.clear.pts;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] === pts[i - 1][0]) break; // reset marker: same done, ctx = floor
    got += pts[i][1];
  }
  return got === want;
});
check(5, 'defaults: clear peak never passes clearAt', () =>
  def.clear.peak <= defaults.clearAt && def.clear.pts.every(p => p[1] <= defaults.clearAt));
check(6, 'defaults: base peak never passes 90% of the window', () =>
  def.base.peak <= defaults.window * 0.9 && def.base.pts.every(p => p[1] <= defaults.window * 0.9));
check(7, 'defaults: clear rereads less than base', () => def.clear.reread < def.base.reread);
check(8, 'start 85k vs 21k: rereads more', () => big.clear.reread > def.clear.reread);
check(9, 'start 85k vs 21k: resets more often', () => big.clear.resets > def.clear.resets);
check(10, 'a 200k window compacts at 180k', () => M.compactAt(200000) === 180000);
check(11, 'clearAt below start + HANDOVER + STEP throws', () => {
  try {
    M.run({ ...defaults, clearAt: defaults.start + M.HANDOVER + M.STEP - 1 });
  } catch (e) {
    return true;
  }
  return false;
});

if (failed) {
  console.log(`${failed} case(s) failed`);
  process.exit(1);
}
console.log('all 11 cases ok');
