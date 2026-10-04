import type { Register } from 'claude-code'

// The relay: after Claude saves a handover, run /clear and submit the prompt
// that continues from it, so nobody has to type anything. Opt-in through the
// `relay` option, which is also the budget: how many clears this process may
// run before it stops and leaves the next one to the user. /relay overrides
// the option for this window (this process) only, and the status line shows
// what is left while it is on.
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

// HEAD of the session's repo, or undefined with no git (or no $.process, which
// is CLI only). Unknown counts as progress: the stall guard stands aside and the
// budget still holds.
async function headOf($: Parameters<Parameters<Parameters<Register>[0]>[2]>[0]): Promise<string | undefined> {
  try {
    const r = await $.process.run(['git', 'rev-parse', 'HEAD'], { timeoutMs: 5000 })
    return r.exitCode === 0 ? r.stdout.trim() || undefined : undefined
  } catch {
    return undefined
  }
}

// What /relay takes: off, on, unlimited or a number. "on" is the option's own
// budget when that is on, else 3. Anything else is undefined: not understood.
export function parseRelay(args: string, fallback: number): number | undefined {
  const s = args.trim().toLowerCase()
  if (s === 'on') return fallback > 0 ? fallback : 3
  if (s === 'off') return 0
  const n = budget(s)
  return n === 0 ? undefined : n
}

export function relayStatus(limit: number, used: number): string {
  if (limit === 0) return 'relay: off'
  if (limit === Infinity) return `relay: on, unlimited (${used} used)`
  return `relay: ${Math.max(0, limit - used)} of ${limit} left`
}

export const register: Register = (on, options) => {
  const configured = budget(options.relay)
  let limit = configured

  let used = 0
  let pending = false
  // The stall guard, as in the headless runner (scripts/lib/run.mjs): HEAD at the
  // last relay, and how many continued sessions in a row ended without a commit.
  let lastHead: string | undefined
  let stalled = 0
  let headlessRun = false

  // The standing status entry: what is left while the relay is on, nothing while off.
  const shown = () => (limit === 0 || headlessRun ? undefined : relayStatus(limit, used))

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    headlessRun = /^(1|true|on|yes)$/i.test((await $.env.get('CLEAR_RESUME_HEADLESS')) ?? '')
    await $.command.register({
      name: 'relay',
      description: 'Clear and continue by itself in this window: off, on, unlimited or a number',
      argumentHint: '[off|on|unlimited|<n>]',
      immediate: true,
    })
    $.ui.status(shown())
    return result
  })

  // Bare /relay reports; with an argument it sets this window's budget and starts
  // the count and the stall guard over.
  on('command.run', { command: 'relay' }, async ($, e) => {
    if (e.args.trim() === '') return { text: relayStatus(limit, used) }
    const set = parseRelay(e.args, configured)
    if (set === undefined) return { text: `relay: "${e.args.trim()}" not understood. Use off, on, unlimited or a number.` }
    limit = set
    used = 0
    stalled = 0
    lastHead = undefined
    if (limit === 0) pending = false
    $.ui.status(shown())
    return { text: relayStatus(limit, used) }
  })

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
    // Turned off for this window: drop the save quietly.
    if (limit === 0) {
      pending = false
      return result
    }
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
    const head = await headOf($)
    stalled = head !== undefined && head === lastHead ? stalled + 1 : 0
    lastHead = head
    if (stalled >= 2) {
      pending = false
      $.ui.toast(
        'clear-resume relay: stopped. Two continued sessions in a row made no new commit. Type /clear to continue from the handover.',
        { timeoutMs: 15000 },
      )
      return result
    }
    used++
    $.ui.status('clear-resume: clearing...')
    // Not awaited: command.run rejects inside a hook the turn is waiting on,
    // and the clear is queued until the session is idle anyway.
    $.clock.after(300, () => {
      $.command.run({ command: 'clear' }).catch(err => {
        pending = false
        $.ui.status(shown())
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
        .then(() => {
          $.ui.status(shown())
          // The VS Code panel draws no status line; a toast is the count it can show.
          $.ui.toast(`clear-resume ${relayStatus(limit, used)}`, { timeoutMs: 8000 })
        })
        .catch(err => {
          $.ui.status(shown())
          $.ui.toast(`clear-resume relay: submit refused: ${String(err)}`, { timeoutMs: 15000 })
        })
    })
    return result
  })
}
