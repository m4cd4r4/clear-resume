# Status

Checked against `origin/main` at b7c9b73 on 2026-10-03. A claim here is a snapshot: re-check
before acting on it.

## Shipped

- [x] Plugin 0.3.2: handover skill, SessionStart load, auto-mode nudge, git-synced store,
  hands-off relay (#58) and its stall guard (#60). `package.json`,
  `plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` all agree on 0.3.2.
- [x] Relay stall guard (#60): stops after two continued sessions in a row make no new commit;
  with no git only the budget applies. With the relay on, the nudge tells a finished task to
  end without a handover.
- [x] Per-window relay: `/relay off|on|unlimited|<n>` overrides the `relay` option for one
  window, and the status line shows the clears left (`relay: 2 of 3 left`). The classic
  nudge still reads the option, so in a window turned on by `/relay` alone its wording says
  to type /clear.
- [x] Windows CI flake in `test/owner.test.mjs` fixed (#61).
- [x] Auto-continue phase 1: headless runs continue themselves (`run.mjs`, #52).
- [x] Nudge settings in `/config` and `/plugin configure` (#51).
- [x] VS Code extension 0.2.2: sidebar, Loaded rows keep play, pin and delete (#53).
- [x] README leads with the work getting buried (#55). 208 lines.

## In flight

- [ ] **Auto-continue phase 2, VS Code** (#54). CLOSED 2026-10-04, superseded by the relay
  and `/relay`; branch kept. Notes below are history. Panel mode passed end to end on
  2026-10-01. Terminal mode: the trust-prompt hang and the missing transcript are both fixed
  on the branch. Still to do:
  - [ ] Re-run the terminal end to end: 2 continues, no keypress.
  - [ ] README auto-continue section.
  - [ ] Version bump and release notes.
  - Known limit: auto mode's permission classifier stops long unattended chains. A local
    test chain stopped at link 861. Do not work around it: a bypass would fail the
    directory's safety scan.
- Relay (shipped in 0.3.1, #58). Validates on 2.1.275+; on 2.1.250-2.1.274 the module is
  rejected but the classic hooks still load. Live runs on 2026-10-03:
  - relay=1, terminal: save, /clear, continue prompt, handover loaded, next action run.
  - relay=8, terminal `claude` 2.1.288, Sonnet, nudge 180k, in I:/Scratch/cr-e2e, task
    "link.sh to link 2500". 17:47-19:55 AWST, 4 segments (links 864-1320, 1321-1718,
    1719-2116, 2117-2500), 3 automatic handovers, each /clear and continue in about 3 s.
    The final reply was RELAY-6HOP-DONE with no handover and no further clear.
  - [ ] Not yet proven: 6 hops in one run, and the trigger from the VS Code chat panel.
- [ ] **Demo v2** (#38). Conflicts with main; needs a rebase or closing.
- [ ] **Context-savings measurement** (#57). `scripts/measure.mjs`. 2026-10-03 run: 191
  real `/clear` loads, median context 195k before and 97k after, a median drop of 101k.

## Not started

- [ ] Publish the plugin to the Claude directory.
- [ ] Simplify the README (after the directory listing settles what it needs to say).

## Known issues

From `docs/CLAUDE-TODO.md`, re-checked 2026-10-03:

| # | Issue | State |
|---|---|---|
| 1 | Flaky `web.test.mjs` / `sync.test.mjs` on Windows | Open. Not re-run today. |
| 2 | Version numbers disagree across manifests | **Fixed** (all 0.3.0). |
| 3 | `save.mjs` prints one directory three ways | Not re-checked. |
| 4 | The auto-mode nudge explains itself twice | Open. `plugin/scripts/lib/nudge.mjs`, still 5 sentences. |
| 5 | Extension README says the store never syncs | **Fixed**. The wording is now scoped to syncing. |

## Worktree cleanup

Removed 2026-10-03: the worktrees for #49, #51, #52, #53 and #55 (each local head matched
its merged PR head), plus a clean detached build checkout. Remaining:

| Branch | PR | Action |
|---|---|---|
| `feat/auto-continue-vscode` | #54 draft | keep |
| `feat/demo-v2` | #38 conflicting | decide: rebase or close |
| `feat/measure-context` | #57 open | keep |
| `docs/status` | #56 merged | remove |
