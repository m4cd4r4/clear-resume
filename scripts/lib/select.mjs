// Decide what a new session does with the waiting handovers for its repo.
// Returns { load, list }: at most one handover to inject, plus any to mention.
//
//   - Newest waiting handover on the current branch -> load it.
//   - None on this branch but exactly one waiting overall -> load it. A cloud
//     session starts on a fresh branch, so a mismatch there is normal.
//   - Anything else (several on other branches) -> list, never guess: loading
//     another window's handover would take it from that window.
//   - Older than maxAgeDays -> list only, so a forgotten handover never lands in
//     unrelated work.
export function chooseHandover(waiting, branch, { now = new Date(), maxAgeDays = 7 } = {}) {
  const ageDays = (h) => (now - new Date(h.meta.created ?? 0)) / 86_400_000;
  const fresh = waiting.filter((h) => ageDays(h) <= maxAgeDays);

  const sameBranch = fresh.filter((h) => (h.meta.branch ?? "") === branch);
  let load = sameBranch.at(-1) ?? null;
  if (!load && fresh.length === 1 && waiting.length === 1) load = fresh[0];

  return { load, list: waiting.filter((h) => h !== load) };
}

export function age(created, now = new Date()) {
  const mins = Math.max(0, Math.round((now - new Date(created)) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
