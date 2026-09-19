# clear-resume

A Claude Code plugin for a simple habit: write a handover, clear the session, and pick up
where you left off in a fresh context.

Status: early. The first commits are a feasibility spike, kept in the history on purpose.

## Why

Long Claude Code sessions carry every earlier message into every new one. Clearing often and
resuming from a short written handover keeps each message's context small. In one user's
transcripts, median context per call fell from about 290k tokens to 193k in the week this
habit was automated (N = 196k calls). That is less context per message, not necessarily
fewer tokens in total.

## Plan

- `/handover` skill: writes a short handover for the current work.
- SessionStart hook: after `/clear` (or a new session), loads the waiting handover
  automatically, so there is nothing to type.
- Runs locally only. Reads nothing outside your machine and sends nothing anywhere.

## Licence

MIT
