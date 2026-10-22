# Sidebar hierarchy pass Brief

Open this in a **fresh Claude Code session** in `I:/Scratch/clear-resume-sidebar-hierarchy/`. Don't carry context from the current session.

## First action: rebase before doing anything else

```bash
git fetch origin main --quiet
git rebase origin/main
```

## The problem

The webview sidebar from #138 renders correctly but the hierarchy is flat. In Macdara's real window the Handovers panel shows four groups: LOADED (27, collapsed), OTHER REPOS (5, waiting, teal dot and rail), STALE (98, collapsed) and ARCHIVED (1,167, expanded). The group he acts on sits under a collapsed LOADED row, and the group that matters least is the one open and filling the panel. The second line of a row also repeats itself ("clear-resume-restyle-webview" then "feat/restyle-webview"). He called it "a bit bland"; the fix is hierarchy, not decoration.

## Source of truth (read these BEFORE designing/coding)

1. `extension/src/sidebar-model.ts` - grouping, ordering, row fields, default expanded state.
2. `extension/src/sidebar-page.ts` and `extension/src/sidebar.ts` - the page and message wiring.
3. `test/sidebar-model.test.mjs` - the 15 existing model tests.
4. `docs/prompts/restyle-webview.md` - the rulings from the first pass (no invented labels, accent, accessibility).
5. `docs/design/screens/` - the screenshots from #138.

If anything in this brief contradicts those source files, **the source files win**.

## What's in scope

1. ARCHIVED and STALE collapsed by default, showing only their counts. The user's own expand or collapse choice still persists as it does today.
2. Waiting handovers (OTHER REPOS and any waiting group for the current repo) ordered above LOADED.
3. Remove the repeated text on a row's second line: show the worktree name and the branch once, not twice, when one contains the other. Rule must be derived from the data, not hand-tuned per row.
4. Archived rows read as finished: dimmed text, no age rail.

## Out of scope (do NOT modify)

- Status bar, hover card, relay (`stats-status.ts` and plugin code).
- The session strip with context, nudge, idle and Hand over. Macdara chose hierarchy fixes only; it is a possible later PR.
- Bulk actions on group headers.
- Any new display copy. If a change needs a new word, put it to Macdara as options first.

## What "good" looks like

- On open, the first thing visible is the waiting handovers, then LOADED, then two collapsed headers with counts.
- ARCHIVED with 1,167 rows costs one line until opened.
- No row says the same thing twice.
- Keyboard navigation and the ARIA tree still pass, including across collapsed groups.

## Required deliverables

1. Short plain-text rationale before code.
2. The change, with model tests for the new ordering, default-collapsed state and second-line rule.
3. Screenshots at normal and narrow sidebar widths in dark, light and high contrast, read by you before reporting. Use a throwaway VS Code with its own `--user-data-dir`; never an Extension Development Host from Macdara's shell. Stop it by its own PID.
4. Full test run and `npm run build` pass.

## Suggested workflow

1. Rebase, read the source files.
2. Rationale, then model change with tests, then page change.
3. Screenshots, then `/design-review`.

## Constraints

- One PR. Branch: `feat/sidebar-hierarchy`.
- No new runtime deps. British English, no em or en dashes.
- When the PR is merged, finish the report first. Do NOT run `wt-finish.sh` from inside this worktree; it deletes your own folder and the window goes blank (`wt-finish` now refuses). Leave removal to the `[wt-cleanup]` reminder.

## Out-of-scope follow-ups (capture, don't build)

Append to `docs/CLAUDE-TODO.md`. Do not fix inline.

## Why this brief is structured this way

The first pass copied features from Compass that clear-resume has no data for. This one limits itself to reordering and collapsing what the handovers already carry.