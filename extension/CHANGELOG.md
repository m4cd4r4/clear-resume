# Changelog

## 0.2.2

- The store listing shows two screenshots: the sidebar with a loaded handover open, and Resume
  filling in a Claude Code tab.

## 0.2.1

First Marketplace release.

- Handovers sidebar in the activity bar, grouped into Current repo, Other repos
  and Stale.
- A Loaded group at the top of the sidebar lists the handovers loaded in the
  last 24 hours. Click one to open its readable copy.
- A status-bar item names the handover this repo loaded most recently, with how
  long ago. Click it to open the same copy. It is hidden when there is none.
- Resume opens a Claude Code tab with the handover's prompt pre-filled and not
  sent, so you can read it before you send it.
- Pin keeps a handover out of the stale and delete timers.
- Reads and writes the same local JSON store as the clear-resume plugin, so a
  handover written by the plugin shows up here with no extra setup.
- Nothing leaves your machine unless you set up syncing. Once the store is
  synced, a resume, pin, unpin or delete in the sidebar pushes it to your git
  remote in the background.
