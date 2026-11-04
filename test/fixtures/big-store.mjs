// A store the size of the real one on 2026-11-04: 2,016 handovers (1,933 archived,
// 71 stale, 11 waiting), bodies ~4.3 KB, captures, and 1,366 relay files. Used by the
// extension-host timing tests and by scripts/perf/refresh-profile.mjs.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const NOW = new Date("2026-11-04T08:00:00Z");
export const FOLDER = "I:/work/app";
// Three sessions in one folder.
export const SESSIONS = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const H = 3_600_000;

export function body(i) {
  const filler = "Notes on what was tried and what is left. ".repeat(90);
  return `# Handover ${i}\n\n## Next action\n- Rebase onto origin/main\n- Open the PR for step ${i}\n\n## Notes\n${filler}`;
}

export function buildStore(dir, count = 2000) {
  const handovers = join(dir, "handovers");
  mkdirSync(handovers, { recursive: true });
  for (let i = 0; i < count; i++) {
    const createdAt = new Date(NOW.getTime() - i * 0.5 * H).toISOString();
    // The three sessions in FOLDER take every third record; the rest spread over 40 repos.
    const repoPath = i % 3 === 0 ? FOLDER : `I:/work/repo-${i % 40}`;
    const status = i < 11 ? "waiting" : "archived";
    const id = `box-${1000 + i}-${createdAt.replace(/[:.]/g, "-")}`;
    const record = {
      schema: 1, id, title: `Handover ${i}`, body: body(i), repoPath, mainPath: repoPath, repo: repoPath.split("/").pop(),
      branch: `feat/step-${i}`, machine: "box", pid: String(1000 + i), createdAt, status, pinned: false,
      sessionId: SESSIONS[i % 3], resumePrompt: "Resume", source: "native", updatedAt: createdAt,
      ...(status === "archived" ? { archivedAt: createdAt, archivedBy: { owner: "", pid: "1", via: i % 7 ? "hook" : "extension" } } : {}),
    };
    writeFileSync(join(handovers, `${id}.json`), JSON.stringify(record, null, 2));
  }
  for (const sessionId of SESSIONS) {
    const cap = join(dir, "artifacts", sessionId);
    mkdirSync(cap, { recursive: true });
    const items = Array.from({ length: 8 }, (_, n) => ({ kind: "link", title: `link ${n}`, text: `https://example.com/${n}` }));
    writeFileSync(join(cap, "meta.json"), JSON.stringify({ sessionId, capturedAt: NOW.toISOString(), items, counts: { link: 8 }, hasLastScreen: false }));
  }
}

export const relayFile = (n, used = 0) => ({
  v: 1, key: `k${n}`, cwd: n < 3 ? FOLDER : `I:/work/repo-${n % 40}`, sessions: [SESSIONS[n % 3]],
  limit: 15, configured: 15, used, stalled: 0, applied: 0, updatedAt: NOW.getTime() - n * 60_000,
});

export function buildRelay(dir, count = 1400) {
  mkdirSync(dir, { recursive: true });
  for (let n = 0; n < count; n++) writeFileSync(join(dir, `k${n}.json`), JSON.stringify(relayFile(n)));
}

/** The longest the event loop went without turning while `fn` ran, in ms. */
export async function longestBlock(fn) {
  let last = performance.now();
  let max = 0;
  let on = true;
  const tick = () => {
    const t = performance.now();
    max = Math.max(max, t - last);
    last = t;
    if (on) setImmediate(tick);
  };
  setImmediate(tick);
  await fn();
  on = false;
  return Math.max(max, performance.now() - last);
}
