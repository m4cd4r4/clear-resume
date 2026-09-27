// Decide what a new session does with the waiting handovers for its repo.
// Returns { load, list }: at most one handover to inject, plus any to mention.
//
//   - This window's own handover (same Claude pid, which survives /clear) -> load
//     it, whatever the branch. That is the handover the user just wrote.
//   - A handover owned by another window that is still running is never loaded
//     automatically, only listed: every window in one folder shares a branch,
//     and the branch rule let one window take another's (2026-09-25).
//   - Newest waiting handover on the current branch -> load it.
//   - None on this branch but exactly one waiting overall -> load it. A cloud
//     session starts on a fresh branch, so a mismatch there is normal.
//   - Anything else (several on other branches) -> list, never guess: loading
//     another window's handover would take it from that window.
//   - Older than maxAgeDays -> list only, so a forgotten handover never lands in
//     unrelated work.
//   - After a compaction (ownOnly) -> this window's own handover or nothing. The
//     session is mid-task with its summary; the branch and only-one rules let it
//     load a closed window's handover from another branch (2026-09-27, XP-4).
//   - Dated more than FUTURE_SKEW_MS ahead of now -> list only, and it never wins.
//     A future date read as fresh, sorted newest and printed "just now", which let
//     a handover committed to a cloned repo beat the user's own (2026-09-27).
export const FUTURE_SKEW_MS = 5 * 60_000;

export function inFuture(created, now = new Date()) {
  return new Date(created) - now > FUTURE_SKEW_MS;
}

export function chooseHandover(waiting, branch, { now = new Date(), maxAgeDays = 7, owner = "", alive = () => false, ownOnly = false } = {}) {
  const ageDays = (h) => (now - new Date(h.meta.created ?? 0)) / 86_400_000;
  const fresh = waiting.filter((h) => ageDays(h) <= maxAgeDays && !inFuture(h.meta.created, now));

  const mine = owner ? fresh.filter((h) => h.meta.owner === owner) : [];
  if (mine.length) {
    const load = mine.at(-1);
    return { load, list: waiting.filter((h) => h !== load) };
  }
  if (ownOnly) return { load: null, list: waiting };
  const claimable = fresh.filter((h) => !h.meta.owner || !alive(h.meta.owner));

  const sameBranch = claimable.filter((h) => (h.meta.branch ?? "") === branch);
  let load = sameBranch.at(-1) ?? null;
  if (!load && claimable.length === 1 && waiting.length === 1) load = claimable[0];

  return { load, list: waiting.filter((h) => h !== load) };
}

export function age(created, now = new Date()) {
  const mins = Math.max(0, Math.round((now - new Date(created)) / 60_000));
  // "0m ago" for something written seconds ago reads like a broken clock.
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
