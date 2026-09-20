#!/usr/bin/env node
// Two-machine conflict drill.
//
// The vitest suite proves conflict resolution against stores it built itself, a
// handful of records old. This runs the same conflicts against a real store, at
// real size, over real git - the one thing a synthetic fixture cannot tell you.
//
//   node scripts/drill.mjs                      # a synthetic store, no network
//   node scripts/drill.mjs <git-url-or-path>    # seeded from a store you have
//
// Given a seed, the store is CLONED into a throwaway bare repo and every push in
// the drill goes there. Your store's remote is read, never written, and the live
// store directory is never opened at all.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listAll, read, remove, save, update } from "../packages/store/store.mjs";
import { initSync, pull, sync } from "../packages/store/sync.mjs";

const seed = process.argv[2];
const D = mkdtempSync(join(tmpdir(), "cr-drill-"));
const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let failures = 0;
const log = (...a) => console.log(...a);
const check = (name, ok, detail = "") => {
  log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`);
  if (!ok) failures++;
};

/** A bare repo for the two machines to meet in, optionally holding a real store. */
function throwawayRemote() {
  const remote = join(D, "remote.git");
  if (seed) {
    git(D, "clone", "--quiet", seed, join(D, "seed"));
    git(D, "clone", "--quiet", "--bare", join(D, "seed"), remote);
    return remote;
  }
  // No seed: build a small store and push it, so the drill runs offline too.
  // -b main matters: a bare repo defaults HEAD to master, and a clone of it then
  // checks out nothing at all while every command still reports success.
  git(D, "init", "--quiet", "--bare", "-b", "main", remote);
  const first = join(D, "first");
  mkdirSync(first, { recursive: true });
  for (let i = 0; i < 5; i++) {
    save(
      {
        title: `seeded ${i}`,
        body: "body",
        repoPath: "/work/demo",
        machine: "seed",
        pid: i,
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, i)),
      },
      { root: first },
    );
  }
  initSync(first, remote);
  return remote;
}

log(seed ? `== seeding a throwaway remote from ${seed} ==` : "== no seed given, building a synthetic store ==");
const REMOTE = throwawayRemote();
const A = join(D, "A");
const B = join(D, "B");
git(D, "clone", "--quiet", REMOTE, A);
git(D, "clone", "--quiet", REMOTE, B);
for (const m of [A, B]) {
  git(m, "config", "user.name", "drill");
  git(m, "config", "user.email", "drill@local");
}
log(`A: ${listAll(A).length} records   B: ${listAll(B).length} records`);
if (!listAll(A).length) {
  console.error("the seed store has no records to fight over");
  process.exit(2);
}

log("\n== 1. both machines rewrite one record; the later write must win ==");
const target = listAll(A)[0].id;
log(`target: ${target}`);
update(target, { branch: "written-on-A" }, { root: A, now: new Date("2026-09-20T05:00:00.000Z") });
update(target, { branch: "written-on-B" }, { root: B, now: new Date("2026-09-20T06:00:00.000Z") });
sync(A);
const rB = sync(B);
check("B's sync resolved a conflict", rB.ok && rB.resolved?.includes(target), `resolved=${JSON.stringify(rB.resolved)}`);
check("later write (B) won on B", read(target, B).branch === "written-on-B", read(target, B).branch);
pull(A);
check("later write (B) won on A too", read(target, A).branch === "written-on-B", read(target, A).branch);

// The same conflict with the push order swapped. Whoever pushes second is the one
// who merges, so a rule that only holds in one direction would pass check 1 alone.
log("\n== 2. the same record again, with the push order reversed ==");
update(target, { branch: "B-first" }, { root: B, now: new Date("2026-09-20T07:00:00.000Z") });
update(target, { branch: "A-later" }, { root: A, now: new Date("2026-09-20T08:00:00.000Z") });
sync(B);
sync(A);
pull(B);
check(
  "later write (A) won on both",
  read(target, A).branch === "A-later" && read(target, B).branch === "A-later",
  `A=${read(target, A).branch} B=${read(target, B).branch}`,
);

log("\n== 3. A deletes while B edits the same record ==");
const victim = listAll(A)[1]?.id;
if (victim) {
  log(`victim: ${victim}`);
  remove(victim, { root: A, now: new Date("2026-09-20T10:00:00.000Z") });
  update(victim, { branch: "B-still-editing" }, { root: B, now: new Date("2026-09-20T09:00:00.000Z") });
  sync(A);
  sync(B);
  pull(A);
  check("the later delete beat the earlier edit", read(victim, B).status === "deleted", read(victim, B).status);
  check("gone from B's tree", !listAll(B).some((r) => r.id === victim));
  check("gone from A's tree", !listAll(A).some((r) => r.id === victim));
}

log("\n== 4. both machines write a handover at the same instant ==");
const at = new Date("2026-09-20T11:00:00.000Z");
const base = { title: "same instant", body: "x", repoPath: "/work/demo", pid: 1, createdAt: at };
const ca = save({ ...base, machine: "alpha", title: "from alpha" }, { root: A });
const cb = save({ ...base, machine: "beta", title: "from beta" }, { root: B });
check("different ids for the same instant", ca.id !== cb.id, `${ca.id} vs ${cb.id}`);
sync(A);
const r4 = sync(B);
pull(A);
const has = (root, t) => listAll(root).some((r) => r.title === t);
check("both survive on A", has(A, "from alpha") && has(A, "from beta"));
check("both survive on B", has(B, "from alpha") && has(B, "from beta"));
check("no conflict resolution was needed", !r4.resolved?.length, JSON.stringify(r4.resolved));

log("\n== 5. full convergence ==");
const fingerprint = (root) =>
  listAll(root, { includeDeleted: true })
    .map((r) => `${r.id}:${r.status}:${r.updatedAt}`)
    .sort();
const fa = fingerprint(A);
const fb = fingerprint(B);
check(
  `${fa.length} records identical on both machines`,
  JSON.stringify(fa) === JSON.stringify(fb),
  fa.length === fb.length ? "" : `A=${fa.length} B=${fb.length}`,
);

log("\n== 6. blast radius ==");
check("A pushes to the throwaway remote", git(A, "remote", "get-url", "origin").includes("remote.git"));
check("B pushes to the throwaway remote", git(B, "remote", "get-url", "origin").includes("remote.git"));

rmSync(D, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
