# Restyle the extension sidebar like the Compass webview Brief

Open this in a **fresh Claude Code session** in `I:/Scratch/clear-resume-restyle-webview/`. Don't carry context from the current session.

## First action: rebase before doing anything else

```bash
git fetch origin main --quiet
git rebase origin/main
```

This branch is deliberately NOT stacked on #132 or #136. If either has merged, the rebase picks it up.

## The problem

The clear-resume sidebar (Handovers and Worktrees) is two native tree views. Session Compass moved to a webview in its PR #28 and looks more finished. Macdara wants clear-resume to look like that, without the two products becoming indistinguishable and without inventing UI copy.

## Source of truth (read these BEFORE designing/coding)

1. `I:/Scratch/session-compass-webview/` - the Compass webview pattern (PR #28). Read how it builds the panel, theming, messaging and state.
2. `extension/package.json` (the `views` block, `viewsWelcome`, menus) - the current two tree views.
3. `extension/src/tree.ts` and `extension/src/lanes-tree.ts` - what data each row carries today.
4. `extension/src/extension.ts` - activation, commands and refresh wiring.
5. `extension/src/stats-status.ts` - owned by the idle-in-hover-card work (branch `feat/idle-in-hover-card`). Do not edit it.

If anything in this brief contradicts those source files, **the source files win**.

## What's in scope

- A webview (or webview views) replacing the Handovers and Worktrees tree views, in the Compass visual pattern.
- `extension/package.json` views and menus as needed.
- Keyboard and screen-reader behaviour for the new view.

## Out of scope (do NOT modify)

- `extension/src/stats-status.ts` and the status bar or hover card (separate PR).
- Handover file format, plugin scripts, relay state.
- Release, tag, version bump.

## Rulings and challenges (settled with Macdara, 2026-10-21)

1. **No invented vocabulary.** Every label, state and filter must come from handover data: branch, age, loaded or waiting. clear-resume has no "held" state, so do NOT add an All/Active/Held filter or a summary strip that implies one. Any new line of display copy goes to Macdara as options first.
2. **Accent colour is his call.** Compass uses #d1805f. Copying it makes the two products look the same. Put 2-3 accent options on localhost for him to pick; do not default to #d1805f.
3. **Accessibility.** A webview loses the tree view's free keyboard navigation and screen-reader support. Rebuild it (roles, arrow keys, focus, labels) or flag the loss to Macdara before shipping. Measure it, do not assume.
4. **Parity.** Every action available in the tree (load, delete, import, context menu) must still be reachable.

## What "good" looks like

- Same family feel as Compass, clearly its own product.
- Nothing the tree showed is lost; nothing new is claimed.
- Works in light, dark and high-contrast themes.
- Keyboard-only use works end to end.

## Required deliverables

1. Short plain-text design rationale before code, including the accent options.
2. The webview, behind the existing commands.
3. Screenshots of the real window at normal and narrow sidebar widths, in two themes, read by you before reporting.
4. Tests for any non-UI logic; build and existing tests pass.

## Suggested workflow

1. Rebase, read the source files.
2. Run `/design-brief` for the accent and layout questions.
3. Rationale, then build, then `/design-review`.

## Constraints

- One PR. Branch: `feat/restyle-webview`.
- No new runtime deps.
- No em or en dashes in published text; British English.
- Test in a throwaway VS Code with its own `--user-data-dir`, never an Extension Development Host from Macdara's shell. Stop it by its own PID.

## Out-of-scope follow-ups (capture, don't build)

Append to `docs/CLAUDE-TODO.md`. Do not fix inline.

## Why this brief is structured this way

The first draft idea included a summary strip and an All/Active/Held filter copied from Compass. clear-resume has no such state, so the brief forbids invented labels up front.