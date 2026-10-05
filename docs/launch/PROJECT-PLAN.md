# Launch plan: 0.4.0 release, extension media, project site

Started 2026-10-05. Goal: the README, CHANGELOG, GitHub releases, both marketplace
listings and a public site all describe the same, current clear-resume, and link to
each other.

## Status

| # | Slug | Scope | Status | Effort | Depends on |
|---|---|---|---|---|---|
| 1 | release-0-4-0 | CHANGELOG for #64 and #66-#70; README covers relay, headless runs, Worktrees view, context pie, relay picker (absorbs open PR #63); plugin + extension to 0.4.0; tag `v0.4.0`; GitHub release. Backfill tags/releases for 0.3.0-0.3.2 at their release commits. | merged (#73) | ~1 h | - |
| 2 | ext-media | Real-use screenshots and short clips of the new extension features, captured in the `demo/` widget-shop fixture under a throwaway VS Code profile and `CLAUDE_CONFIG_DIR`. Used by README, marketplace listing, site. Publish extension 0.4.0 to VS Code Marketplace and Open VSX. | later | ~1-1.5 h | 1 |
| 3 | site-pages | Move `I:/Scratch/cr-e2e/site` into `site/`; point `factcheck.mjs` at the real README/CHANGELOG instead of the fixture; add install hub (plugin commands first, extension second, both marketplaces, latest release); GitHub Pages workflow on `release: published` + `workflow_dispatch`; repo homepage field and README link to the site. | materialised | ~1 h | 1 |

## Waves

- **Wave 1:** release-0-4-0.
- **Wave 2:** ext-media and site-pages, in parallel. Their only shared file is
  `README.md` (media embeds vs site link); site-pages rebases on ext-media if both are open.

## Gates (ask first, every time)

- Publishing the GitHub release for v0.4.0 (it also triggers the site deploy once wave 2 lands).
- Publishing the extension to either marketplace.
- The site's first deploy and any later manual `workflow_dispatch`.

Merging a PR never deploys anything: Pages runs only on a published release or a manual run.

## Decisions

- Site lives in this repo on GitHub Pages at `m4cd4r4.github.io/clear-resume` (Macdara, 2026-10-05).
- Deploy trigger is release publish, not push to main, so the ask-first deploy gate holds (Macdara, 2026-10-05).
- The plugin does the work; the extension is optional and needs the plugin. Every install surface says so in that order.
- Every screenshot and clip comes from real use. The replay video (`site/media/replay.mp4`) is built from transcripts and git only.

## What this plan does NOT cover

- A custom domain for the site (DNS change, separate ask).
- PR #54 (closed; VS Code auto-continue) and PR #65 (explainer snapshot) - independent.
- The cr-e2e replay pipeline itself; only its outputs (`site/`, `site/media/`) move.
