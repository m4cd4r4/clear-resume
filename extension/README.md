# clear-resume

Browse your Claude Code handovers and resume one in a fresh conversation.

A handover is a short brief a session writes about its own work, so the next
session can carry on without the conversation that produced it. This extension
is the history view over them; the [clear-resume plugin](https://github.com/m4cd4r4/clear-resume)
writes them and loads them automatically when you `/clear`.

## What it gives you

- A **Handovers** sidebar, grouped into Current repo, Other repos and Stale.
- **Resume** opens a Claude Code tab with that handover's prompt pre-filled and
  not submitted, so you read it before you send it.
- **Pin** keeps a handover out of the stale and delete timers.
- **Import existing handovers** reads an older `~/Notes/resume` layout into the
  shared store. Additive and idempotent: it never deletes the originals.

The plugin covers the common path - write a handover, `/clear`, the next session
in that repo loads it with no typing. The sidebar is for the rest: an older
handover, one from another repo, or one you want to read before resuming.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `clearResume.storePath` | `~/.clear-resume` | Folder holding the handover store. |
| `clearResume.showArchived` | `false` | Show already-resumed handovers in the tree. |

## Privacy

Everything is local. The store is plain JSON files on disk, one per handover.
Nothing is uploaded and nothing syncs.
