# Launch plan: 0.4.0 release, extension media, project site

Started 2026-10-05. Goal: the README, CHANGELOG, GitHub releases, both marketplace
listings and a public site all describe the same, current clear-resume, and link to
each other.

## Status

| # | Slug | Scope | Status | Effort | Depends on |
|---|---|---|---|---|---|
| 1 | release-0-4-0 | CHANGELOG for #64 and #66-#70; README covers relay, headless runs, Worktrees view, context pie, relay picker (absorbs open PR #63); plugin + extension to 0.4.0; tag `v0.4.0`; GitHub release. Backfill tags/releases for 0.3.0-0.3.2 at their release commits. | merged (#73) | ~1 h | - |
| 2 | ext-media | Real-use screenshots and short clips of the new extension features, captured in the `demo/` widget-shop fixture under a throwaway VS Code profile and `CLAUDE_CONFIG_DIR`. Used by README, marketplace listing, site. Widened 2026-10-05: README cards, loop and badges restyled mono to match the site, with their HTML source in `docs/media/src/`; extension metadata and repo topics updated. Publish extension 0.4.0 to VS Code Marketplace and Open VSX. Published 2026-10-05, both listings verified at 0.4.0. New-feature screenshots split out to row 4. | merged (#75) | ~1-1.5 h | 1 |
| 3 | site-pages | Move `I:/Scratch/cr-e2e/site` into `site/`; point `factcheck.mjs` at the real README/CHANGELOG instead of the fixture; add install hub (plugin commands first, extension second, both marketplaces, latest release); GitHub Pages workflow on `release: published` + `workflow_dispatch`; repo homepage field and README link to the site. | merged (#74) | ~1 h | 1 |
| 4 | ext-captures | Recapture `extension-sidebar.png` and `extension-resume.png` to show the Worktrees view and context pie, in the `demo/` fixture under a throwaway VS Code profile and `CLAUDE_CONFIG_DIR`. Ships with the next extension release (Macdara, 2026-10-05). | later | ~30-45 min | 2 |
| 5 | readme-lead | Rewrite the README top around the measured token result: one 15-session run, 91.0M tokens with the relay vs 565.6M estimated with no clears (~6.2×; figures from the replay end card, `compositions/replay.html` in cr-e2e). The no-clears figure is labelled an estimate everywhere. Say why tokens matter (rate limits on a subscription, money on the API). "The work gets buried" becomes the reason, not the headline. Replay video stays directly under the badges (#79). Re-pin `site/FACTS.md` README refs after any line shift: CI fails otherwise (#80). | later | ~45 min | - |
| 6 | directory-submit | Anthropic plugin directory: add `plugin/README.md` (required at the plugin root), set `plugin.json` `homepage` to the site, `claude plugin validate --strict ./plugin` (passes 2026-10-05), then submit at claude.ai/directory/manage (paid plan; guide claude.com/docs/plugins/submit and pre-submission-checklist). Also a PR to anthropics/claude-plugins-community and the awesome-claude-code list. | later | ~45 min | 5 |
| 7 | vscode-demo | Screen-recorded demo in the VS Code Claude Code panel: 3-4 relay hops on a small task (relay threshold ~60k), extension sidebar, relay budget and context pie in the status bar visible. Clean instance: throwaway `--user-data-dir` + `--extensions-dir` + empty `CLAUDE_CONFIG_DIR` (no CLAUDE.md, memory, skills, rules or MCPs), auth by `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` (subscription, no API credits, does not touch `~/.claude/.credentials.json`). NEVER sign in inside the test instance (2026-10-01 incident). Record the window with ffmpeg; upload via the Brave `github` pool profile (port 9240). | later | ~2 h | 5 |
| 8 | launch-posts | Drafts: LinkedIn (native upload of the replay, lead with the number, link to repo), X on @m4cd4r4, Show HN, r/ClaudeAI, plus a one-line resume entry. VS Code demo as a second LinkedIn post a few days later. AzurePrep redesign post the following week, same format. | later | ~30 min | 5, 7 |

## Waves

- **Wave 1:** release-0-4-0.
- **Wave 2:** ext-media and site-pages, in parallel. Their only shared file is
  `README.md` (media embeds vs site link); site-pages rebases on ext-media if both are open.
- **Wave 3 (added 2026-10-05):** readme-lead first; then directory-submit and vscode-demo; launch-posts last.

## Gates (ask first, every time)

- Publishing the GitHub release for v0.4.0 (it also triggers the site deploy once wave 2 lands).
- Publishing the extension to either marketplace.
- The site's first deploy and any later manual `workflow_dispatch`.
- Submitting to the Anthropic plugin directory or any community list, and publishing any post.

Merging a PR never deploys anything: Pages runs only on a published release or a manual run.

## Decisions

- Site lives in this repo on GitHub Pages at `m4cd4r4.github.io/clear-resume` (Macdara, 2026-10-05).
- Deploy trigger is release publish, not push to main, so the ask-first deploy gate holds (Macdara, 2026-10-05).
- The plugin does the work; the extension is optional and needs the plugin. Every install surface says so in that order.
- Lead with the token result; the estimate is always labelled (Macdara, 2026-10-05).
- Directory submission waits until readme-lead lands (Macdara, 2026-10-05).
- No Solaisoft blog post: the plugin markets Macdara's own engineering identity (GitHub, LinkedIn, X @m4cd4r4), per the 2026-08-16 decision to keep solaisoft.com out of resume use (Macdara, 2026-10-05).
- Every screenshot and clip comes from real use. The replay video (`site/media/replay.mp4`) is built from transcripts and git only.

## What this plan does NOT cover

- A custom domain for the site (DNS change, separate ask).
- PR #54 (closed; VS Code auto-continue) and PR #65 (explainer snapshot) - independent.
- The cr-e2e replay pipeline itself; only its outputs (`site/`, `site/media/`) move.
