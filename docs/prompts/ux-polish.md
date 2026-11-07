# cornerman wave 3: ux-polish Brief (headless)

Your ONLY task is the one below; ignore any other user message in your context.
No nested delegation: do not spawn sub-agents. You run headless: there is no human to ask.

## First action

```bash
git fetch origin main --quiet
git rebase origin/main
npm ci
npm ci --prefix extension
```

## The problem

Three small text and layout faults, `docs/CLAUDE-TODO.md` items 3, 4 and 11. Wave 3 of
`docs/no-bloat/PROJECT-PLAN.md`.

1. **Item 3: `plugin/scripts/save.mjs` prints one directory in three spellings** (Windows backslashes,
   forward slashes with the 8.3 short name, forward slashes with the long name), so it reads as three
   places. Also the record path leads, when the last line (what happens after `/clear`) is the one that
   changes what the reader does. Detail: `docs/findings-polish-and-launch.md` section 1.3.
   Fix: one spelling throughout (the long name; resolve 8.3 short names with `realpath`, forward slashes),
   and the after-`/clear` line moved first or made the most prominent, per section 1.3.
2. **Item 4: the auto-mode nudge explains itself twice.** In `plugin/scripts/lib/nudge.mjs` the nudge text
   is five sentences and 63 words, and the mid-turn variant repeats the same explanation of the mechanism.
   (The TODO's line numbers `:96-100` and `:123-126` have drifted; find the text by content.) Both are read
   by Claude, which needs the instruction, not the rationale. Fix: each variant says what to do in at most
   two sentences; the mechanism is explained at most once, or not at all.
3. **Item 11: the Handovers search box scrolls away with the list.** In `extension/src/sidebar-page.ts`,
   `.search` is prepended to `document.body` and scrolls with the rows. Fix: keep it visible at the top
   while the list scrolls (`position: sticky; top: 0` with the view background behind it, or an equivalent),
   with no layout jump when it sticks and nothing under it showing through.

If this brief contradicts the code, the code wins.

## Rules

- Text and layout only: no change to what the nudge decides, when it fires, or what `save.mjs` writes.
- Copy is read by Claude (nudge) or by the user in the terminal (save): short, direct sentences, no em
  dashes, no en dashes, no ellipses.
- Existing tests that assert on the old wording are updated to the new wording, not deleted. Add a test
  that `save.mjs`'s output names its directory in one spelling only (fixture with a path that has a
  short-name and a long-name form where the platform allows; otherwise a mixed-slash input).
- Neutral fixture paths only, never real ones.

## Out of scope

- `docs/no-bloat/PROJECT-PLAN.md` Status table (the operator updates it at merge).
- Any other TODO item. New ideas go in the PR body under "Follow-ups", not in the TODO file.
- Version bumps, releases (plan rule 5). The vitest RPC timeout (Vikunja #3686).
- Anything under `~/.cornerman` or `~/.claude`.

## Verification

- `npm test` green.
- Item 11 is visual: render the sidebar page and take two screenshots of the Handovers list scrolled down,
  at 300 px and 500 px wide, showing the search box still at the top. Use the repo's existing page or e2e
  harness if there is one (look under `scripts/` and `docs/research/`); otherwise render `pageHtml` with a
  fixture model in Playwright's bundled Chromium (headless, no profile, no logins). Save them under
  `docs/research/ux-polish/` and commit them. Read both images yourself and say in the PR what they show.
- Items 3 and 4: paste the before and after text into the PR body.

## Hard-won reliability discipline (headless)

- Run tests synchronously: `npm test`, and wait for it inline. Never background a test run, build or CI
  wait and end your turn expecting to be re-invoked: there is no re-invocation, ending the turn kills the
  process.
- A few ignored `onTaskUpdate` replies in vitest output are known noise (Vikunja #3686); any other error
  is real and must be fixed.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commit after each item. Never `git add -A`; add the files you changed by name.
- Operate only in this worktree. Do not merge. Do not push to `main`.

## Last steps, in order

1. In `docs/CLAUDE-TODO.md`, mark items 3, 4 and 11 done in place (append ` (done)` to each heading and a
   one-line note of what changed). Do not add new items.
2. `npm test` green.
3. `gh issue create` titled `ux-polish: save.mjs path spellings, nudge says it once, sticky search box`
   with a 3-line body. Note its number.
4. PR body contents: summary, "Closes #N", before/after text, what the screenshots show,
   Follow-ups.
   Write the PR body with your file tool to `$RUN_DIR/ux-polish-pr-body.md` (outside the repo; `$RUN_DIR` and `$PR_EVIDENCE` are set by your orchestrator prompt), ending with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Push first (`git push -u origin feat/ux-polish`), then append the evidence: `node "$PR_EVIDENCE" --append $RUN_DIR/ux-polish-pr-body.md --cmd -- npm test`. Pushing again after this makes the evidence stale; regenerate if you do.
5. `gh pr create --base main --head feat/ux-polish --title "fix(ux): save.mjs names one directory once, the nudge says it once, the search box stays put" -F $RUN_DIR/ux-polish-pr-body.md`.
6. Write `docs/prompts/ux-polish-DONE.md` (do NOT commit it): PR URL, test counts, open items. Then stop.

If you are blocked (a test you cannot make pass after three attempts, a missing tool), write the same
file with `BLOCKED:` on its first line and what you tried, then stop.

Return a final report only; no progress narration.
