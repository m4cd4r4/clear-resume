import type { Register } from 'claude-code'

// The relay: after Claude saves a handover, run /clear and submit the prompt
// that continues from it, so nobody has to type anything. Opt-in through the
// `relay` option, which is also the budget: how many clears this process may
// run before it stops and leaves the next one to the user.
//
// The module lives in the process and /clear keeps the process, so `pending`
// and `used` survive the clear. A reload (a config change, an update) starts
// them over. No session.start fires after a clear: session.end with reason
// 'clear' is the signal that the new conversation is there, and by then the
// SessionStart hook has loaded the handover.

// What save.mjs prints on a good save (plugin/scripts/save.mjs).
export const SAVED = 'Saved handover "'
export const SAVE_SCRIPT = /scripts\/save\.mjs/

export const RESUME_TEXT = 'Continue from the clear-resume handover that was just loaded.'

// "off" or unset is 0, "unlimited" has no cap, a number is that many clears.
export function budget(raw: unknown): number {
  const s = String(raw ?? 'off').trim().toLowerCase()
  if (s === 'unlimited') return Infinity
  const n = Number(s)
  return Number.isInteger(n) && n > 0 ? n : 0
}

export const register: Register = (on, options) => {
  const limit = budget(options.relay)
  if (limit === 0) return

  let used = 0
  let pending = false

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (
      e.agentId === undefined &&
      SAVE_SCRIPT.test(e.command.replace(/\\/g, '/')) &&
      ran.deny === undefined &&
      ran.isError !== true &&
      (ran.text ?? '').includes(SAVED)
    ) {
      pending = true
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!pending || e.agentId !== undefined) return result
    // The headless runner (run.mjs) ends the process instead; it has its own budget.
    if ((await $.env.get('CLEAR_RESUME_HEADLESS'))?.match(/^(1|true|on|yes)$/i)) {
      pending = false
      return result
    }
    // An interrupted or failed turn is the user's to finish: do not clear under them.
    if (e.reason !== 'answer') {
      pending = false
      return result
    }
    if (used >= limit) {
      pending = false
      $.ui.toast(`clear-resume relay: budget of ${limit} used. Type /clear to continue from the handover.`, {
        timeoutMs: 15000,
      })
      return result
    }
    used++
    $.ui.status('clear-resume: clearing...')
    // Not awaited: command.run rejects inside a hook the turn is waiting on,
    // and the clear is queued until the session is idle anyway.
    $.clock.after(300, () => {
      $.command.run({ command: 'clear' }).catch(err => {
        pending = false
        $.ui.status(undefined)
        $.ui.toast(`clear-resume relay: /clear refused: ${String(err)}`, { timeoutMs: 15000 })
      })
    })
    return result
  })

  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason !== 'clear' || !pending) return result
    pending = false
    $.ui.status('clear-resume: continuing...')
    $.clock.after(1000, () => {
      $.prompt
        .submit({ text: RESUME_TEXT, asUser: true })
        .then(() => $.ui.status(undefined))
        .catch(err => {
          $.ui.status(undefined)
          $.ui.toast(`clear-resume relay: submit refused: ${String(err)}`, { timeoutMs: 15000 })
        })
    })
    return result
  })
}
