// Archive waiting handovers whose branch has shipped.
//
// Asking the forge costs a network call per record, so this is async and lives apart
// from prune(), which runs inline on session start and on every sidebar activation.
// The caller supplies `isMerged`; the store knows nothing about GitHub.
import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { archiveRecord, listAll, storeRoot } from "./store.mjs";

const DEFAULT_BRANCHES = new Set(["main", "master", "develop", "trunk"]);

const ghJson = (cwd) =>
  new Promise((resolve, reject) => {
    execFile(
      "gh",
      ["pr", "list", "--head", cwd.branch, "--state", "all", "--json", "state,mergedAt", "--limit", "10"],
      { cwd: cwd.repoPath, timeout: 15_000, windowsHide: true },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });

/**
 * Whether the record's branch has shipped: it has a PR merged after the handover was
 * written and none still open. Asks the forge, never git ancestry, because a squash
 * merge leaves the branch looking unmerged forever.
 *
 * "After the handover was written" matters: a branch reused for new work has an old
 * merged PR, and that handover is not done. A default branch never has a head PR.
 * `run` is injectable so the test needs no network.
 */
export async function prMerged(record, run = ghJson) {
  if (!record.branch || record.branch.startsWith("detached@") || DEFAULT_BRANCHES.has(record.branch)) return false;
  const prs = JSON.parse(await run(record));
  if (prs.some((p) => p.state === "OPEN")) return false;
  const wrote = Date.parse(record.createdAt);
  return prs.some((p) => p.state === "MERGED" && Date.parse(p.mergedAt) > wrote);
}

/**
 * Archive every waiting, unpinned record written on this machine for which
 * `isMerged(record)` resolves true. Returns the ids archived.
 *
 * A check that throws leaves its record waiting: no network is "not known", never
 * "done".
 */
export async function archiveMerged({ root = storeRoot(), now = new Date(), isMerged = prMerged } = {}) {
  const archived = [];
  for (const record of listAll(root)) {
    if (record.status !== "waiting" || record.pinned || record.machine !== hostname()) continue;
    let merged = false;
    try {
      merged = await isMerged(record);
    } catch {
      continue;
    }
    if (!merged) continue;
    archiveRecord(record.id, { root, now, by: { owner: "", pid: String(process.pid), via: "merged" } });
    archived.push(record.id);
  }
  return archived;
}
