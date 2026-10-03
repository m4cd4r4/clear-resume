# Status

Checked against `origin/main` at 347d749 on 2026-10-03. A claim here is a snapshot: re-check
before acting on it.

## Shipped

- [x] Plugin 0.3.0: handover skill, SessionStart load, auto-mode nudge, git-synced store.
  `package.json`, `plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
  all agree on 0.3.0.
- [x] Auto-continue phase 1: headless runs continue themselves (`run.mjs`, #52).
- [x] Nudge settings in `/config` and `/plugin configure` (#51).
- [x] VS Code extension 0.2.2: sidebar, Loaded rows keep play, pin and delete (#53).
- [x] README leads with the work getting buried (#55). 208 lines.

## In flight

- [ ] **Auto-continue phase 2, VS Code** (#54, draft). Panel mode passed end to end on
  2026-10-01. Terminal mode: the trust-prompt hang and the missing transcript are both fixed
  on the branch. Still to do:
  - [ ] Re-run the terminal end to end: 2 continues, no keypress.
  - [ ] README auto-continue section.
  - [ ] Version bump and release notes.
  - Known limit: auto mode's permission classifier stops long unattended chains. A local
    test chain stopped at link 861. Do not work around it: a bypass would fail the
    directory's safety scan.
- [ ] **Hands-off relay through a Claude Code mod.** On branch feat/relay-mod: plugin/hooks/relay.ts, option `relay` (off / N / unlimited), nudge text, 9 mod tests (`npm run test:mod`, each guard mutation-checked). Validates on 2.1.275+. On 2.1.250-2.1.274 the module is rejected but the classic hooks still load (measured 2026-10-03 with the modules flag on). PR #58. Live terminal end-to-end test passed 2026-10-03 (relay=1: save, /clear, continue prompt, handover loaded, next action run).
  On 2026-10-03 it cleared a VS Code session and submitted the next prompt with no keypress.
  Proven: the mod can run the built-in `clear`; `prompt.submit` lands in the new
  conversation; the SessionStart hook still loads the handover first. Still open:
  - [ ] Confirm the trigger works from the VS Code chat panel specifically.
  - [ ] Type-check and tests.
  - [ ] Move it into `plugin/`.
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
