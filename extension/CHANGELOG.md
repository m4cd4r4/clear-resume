# Changelog

## 0.2.1

First Marketplace release.

- Handovers sidebar in the activity bar, grouped into Current repo, Other repos
  and Stale.
- Resume opens a Claude Code tab with the handover's prompt pre-filled and not
  sent, so you can read it before you send it.
- Pin keeps a handover out of the stale and delete timers.
- Import existing handovers reads an older local prompt folder into the shared
  store, for the one setup that has one. Additive and idempotent: it never
  deletes the originals.
- Reads and writes the same local JSON store as the clear-resume plugin, so a
  handover written by the plugin shows up here with no extra setup.
- Everything is local. Nothing is uploaded and nothing syncs on its own.
