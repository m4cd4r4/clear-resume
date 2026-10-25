# Changelog

## Unreleased

- **Assets under each handover.** Open a row's chevron and its session's tables, lists, links and paths
  are listed under **Assets**, collapsed by default. A click opens a link in the browser, a path in the
  editor, a table or list in a markdown tab, or the last screen. Needs the plugin's new SessionEnd hook.

Needs a clear-resume plugin with the hand-over poll in its relay mod.

- The nudge size and **Hand over** moved from the status bar into the context pie's hover card,
  as links under the relay log. The status bar keeps the pie and the relay count.

- A fresh Claude tab no longer shows the previous tab's context count. While compass has no
  row for the focused tab, the pie, relay, nudge and Hand over items are hidden, and the
  relay lookup returns nothing instead of a sibling tab's file.

- The nudge size you pick in the footer now survives a reload. A reload writes a new relay file
  for the same session, which used to lose the pick and fall back to the plugin option. The new
  file takes the newest pick made on any relay file holding the same session. A new tab still
  starts at the default.

- The handover status-bar item is gone. The context pie's hover card now shows the handover
  the focused tab's Claude process loaded, so a parallel session's handover no longer shows in
  every tab. Open handover is a link in the same card.

- A **Hand over** item in the status bar has the window's Claude session write a handover
  now. With the relay on it then clears and continues by itself; with it off it only saves.
  A click during a reply waits for the reply to finish.

## 0.4.0

Needs the clear-resume plugin 0.4.0 or later for the context pie and the relay item.

- A **context pie** in the status bar fills towards the plugin's nudge size: amber from
  80%, red past it. Its hover card shows the relay, the chain of continued sessions and
  an upper bound on what the clears saved.
- A **relay** item shows this window's clears used against its budget. Click it to pick a
  new budget or turn the relay off.
- With two windows on one repo, each status bar names the handover its own window loaded
  and reads its own session's context, not the folder's newest.
- A **Worktrees** view lists the open repo's git worktrees oldest first, each with its
  branch, start time and newest handover's state. Click one to open it in its own
  window (`clear-resume: Open worktree window`).
- New setting `clearResume.registryPath`: point it at a worktree registry and each row
  names its plan row, plan position and wave, with queued entries under Next up
  (folded past 8).
- Plugin: `scripts/label.mjs <slug> --registry <file>` prints the same label as JSON,
  for scripts that name windows or kickoff handovers.
- Plugin: `save.mjs --unowned` writes a handover for a session that has not started
  yet, so it is not marked as held by the window that wrote it.

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
- Resume opens a Claude Code tab with the handover's prompt pre-filled, so you
  can read it before you send it.
- Pin keeps a handover out of the stale and delete timers.
- Reads and writes the same local JSON store as the clear-resume plugin, so a
  handover written by the plugin shows up here with no extra setup.
- Nothing leaves your machine unless you set up syncing. Once the store is
  synced, a resume, pin, unpin or delete in the sidebar pushes it to your git
  remote in the background.
