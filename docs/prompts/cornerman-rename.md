# Rename clear-resume to cornerman Brief

Open this in a **fresh Claude Code session** in this worktree. Don't carry context from the current session.

## First action: rebase before doing anything else

```bash
git fetch origin main --quiet
git rebase origin/main
```

Resolve any conflicts now, then continue.

## The problem

The plugin and VS Code extension are called clear-resume, which names one mechanism. The product also keeps a record of each session's work, so Macdara chose a new name and wants a new logo. The rename must carry every existing handover across without loss.

## Decided, do not reopen

- Name: **cornerman**. Macdara accepted two known risks: a pending USPTO Class 9 application (Serial 99543685) and a small CornerMan AI boxing coach app. It was screened, never legally cleared, so never describe it as cleared.
- Full rename including the store migration, not a display-name rebrand.
- A new logo is wanted.

## Source of truth (read these BEFORE coding)

1. [plugin/packages/store/store.mjs](plugin/packages/store/store.mjs): `storeRoot`, and how records are read and pruned
2. [plugin/packages/store/migrate.mjs](plugin/packages/store/migrate.mjs): the existing migration, and the id-collision history in `schema.mjs`
3. [plugin/packages/store/sync.mjs](plugin/packages/store/sync.mjs): how two machines share the store
4. [plugin/.claude-plugin/plugin.json](plugin/.claude-plugin/plugin.json), [.claude-plugin/marketplace.json](.claude-plugin/marketplace.json), [extension/package.json](extension/package.json): the identities that change
5. [site/FACTS.md](site/FACTS.md): every site claim, cited by file and line

If anything in this brief contradicts those files, the files win.

## What's in scope

Re-measure first with `git grep -il "clear.resume"` (795 lines in 125 files before 0.5.2).

- Product name in code, docs and site
- Slash-command prefix, plugin name, marketplace entry
- Store path `~/.clear-resume`
- `CLEAR_RESUME_*` env vars
- Extension ID `macdara.clear-resume`
- Logo: `extension/media/icon.svg`, `plugin/.claude-plugin/icon.svg`, `plugin/.claude-plugin/icon.png`. The current mark is a dot on a broken vertical line on navy. A cornerman sits you down between rounds and tells you what happened and what to do next.

## Out of scope (capture, don't build)

- Wider asset capture (see project memory `rebrand-cornerman`)
- Historic facts: old changelog entries and past research stay true as written
- Anything in `docs/research/` that quotes the old name as evidence

## What "good" looks like

- Every handover, capture, pin and tombstone in an existing store is present afterwards, byte-compared by a test on a fixture
- The migration is safe to re-run, safe to interrupt, and safe when two sessions start at once
- Two machines syncing, one upgraded and one not, lose nothing and resurrect nothing
- An existing install has a stated upgrade path, including settings and env vars set under the old names
- The site and README read as one product under the new name
- `git grep -i "clear.resume"` returns only deliberate leftovers, each listed in the PR

## Required deliverables

1. State the verification plan and the migration design in plain text before code
2. One PR on `chore/cornerman-rename`, with the generated `## Evidence` section
3. Tests for the migration first: fresh machine, existing store, interrupted run, re-run, parallel start, 3 sessions in one folder
4. Logo checked by reading rendered images at sidebar and Marketplace sizes
5. Append `clear-resume` to `~/.claude/retired-terms.txt` and sweep always-loaded files
6. A separate reviewer agent on the migration, given the diff and test evidence only (opus, since it can delete user data). Run a Fake-Adversary pass before reporting done

## Constraints

- `site/FACTS.md` cites files by line number and CI fails when lines shift. Run `node site/factcheck.mjs` after every doc edit.
- Sandbox the plugin with `node ~/.claude/scripts/plugin-dev.mjs <worktree>`. Never install a dev build into the live config, and never launch an Extension Development Host without the throwaway dirs in `rules/dev-environment.md`.
- This session runs on the live clear-resume plugin. Never move, rename or write to the real `~/.clear-resume` while testing.
- Bump the version in the same commit as the behaviour change.
- British English. No em dashes, en dashes or ellipsis characters in published text.

## Needs Macdara's fresh approval, each one

Merged PR 165 (keep handovers forever) is unreleased and ships with this rename. Macdara's installed 0.5.0 keeps deleting archived handovers past 30 days until then, so say when the release is ready rather than sitting on it.

- Renaming the GitHub repo
- Tagging and creating the GitHub release
- Publishing to the VS Code Marketplace or Open VSX
- Updating the live plugin and extension, and migrating the real store
- Manual `pages.yml` dispatch for the site (release-triggered Pages deploys fail on the tag rule)

## Why this brief is structured this way

A collision in this store is silent data loss, and it has already eaten five records. The migration is the risk here, and the text rename is the easy part.