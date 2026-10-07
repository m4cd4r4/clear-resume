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
//
// The VS Code extension's status bar reads this window's relay from a state file
// the module writes, <store>/relay/<key>.json, and changes this window's budget
// by writing <key>.set.json beside it, which the module reads before each clear.
// Its "Hand over" button writes <key>.handover.json; the module polls for it once
// a second, idle or not, and runs the handover skill, which the relay then clears
// and continues from as after any other save. With the relay off it only saves.

// What save.mjs prints on a good save (plugin/scripts/save.mjs).
export const SAVED = 'Saved handover "'
export const SAVE_SCRIPT = /scripts\/save\.mjs/

export const RESUME_TEXT = 'Continue from the clear-resume handover that was just loaded.'

// What the status bar's "Hand over" button runs, and the prompt sent instead if
// the command is refused (a host that does not list plugin skills as commands).
export const HANDOVER_COMMAND = 'clear-resume:handover'
export const HANDOVER_TEXT = 'Write a clear-resume handover now, with the /clear-resume:handover skill.'
const POLL_MS = 1000

// "off" or unset is 0, "unlimited" has no cap, a number is that many clears.
export function budget(raw: unknown): number {
  const s = String(raw ?? 'off').trim().toLowerCase()
  if (s === 'unlimited') return Infinity
  const n = Number(s)
  return Number.isInteger(n) && n > 0 ? n : 0
}

// The state file's shape. The extension reads it (plugin/packages/store/relay-state.mjs).
export type RelayFile = {
  v: 1
  key: string
  cwd: string
  // This window's session ids, oldest first: one per clear, the chain.
  sessions: string[]
  limit: number | 'unlimited'
  configured: number | 'unlimited'
  used: number
  stalled: number
  // The `at` of the last override taken from <key>.set.json, or of the last
  // /relay typed in the window; 0 for none.
  applied: number
  updatedAt: number
}

const asJson = (n: number): number | 'unlimited' => (n === Infinity ? 'unlimited' : n)

type Engine = Parameters<Parameters<Parameters<Register>[0]>[2]>[0]

// HEAD of the session's repo, or undefined with no git (or no $.process, which
// is CLI only). Unknown counts as progress: the stall guard stands aside and the
// budget still holds.
async function headOf($: Engine): Promise<string | undefined> {
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

// <store>/relay, the store being CLEAR_RESUME_HOME or ~/.clear-resume as in
// packages/store/store.mjs. Undefined when there is no home to put it under.
export async function relayDir($: Engine): Promise<string | undefined> {
  const own = await $.env.get('CLEAR_RESUME_HOME')
  if (own) return `${own.replace(/[/\\]+$/, '')}/relay`
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'))
  return home ? `${home.replace(/[/\\]+$/, '')}/.clear-resume/relay` : undefined
}

async function headlessRun($: Engine): Promise<boolean> {
  return /^(1|true|on|yes)$/i.test((await $.env.get('CLEAR_RESUME_HEADLESS')) ?? '')
}

// One process's relay. The module lives in the process, so this outlives /clear.
type Relay = {
  configured: number
  limit: number
  // This process's name in the relay folder. A reload starts the count over, so a
  // new file is right; the extension reads the newest one for its folder.
  key: string
  sessions: string[]
  applied: number
  used: number
  pending: boolean
  // The stall guard, as in the headless runner (scripts/lib/run.mjs): HEAD at the
  // last relay, and how many continued sessions in a row ended without a commit.
  lastHead: string | undefined
  stalled: number
  headless: boolean
  // The `at` of the last hand-over request taken from <key>.handover.json, and
  // whether the poll for it is running. The poll's timer outlives /clear.
  asked: number
  polling: boolean
  // The session last warned that the nudge went unanswered, so it warns once.
  warned: string | undefined
}

// Told after a nudged turn ends with no save through save.mjs. Seen 2026-10-07: a
// user's own skill also named "handover" saved by its own script, the relay never
// armed, and nothing said so.
export const UNARMED_TEXT =
  'clear-resume relay: no handover was saved with /clear-resume:handover after the context nudge, so the relay will not clear. ' +
  'If the work goes on, run /clear-resume:handover (another handover skill does not count), or type /clear.'

// The nudge (scripts/lib/nudge.mjs) marks a session it has asked to hand over at
// <store>/.nudged/<slug of the session id>, the slug as in scripts/lib/store.mjs.
async function nudged($: Engine, id: string): Promise<boolean> {
  const dir = await relayDir($)
  const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
  if (!dir || !slug) return false
  try {
    await $.fs.read(`${dir.replace(/[/\\]relay$/, '')}/.nudged/${slug}`)
    return true
  } catch {
    return false
  }
}

// A finished turn with the relay on and nothing saved: if the nudge has asked this
// session for a handover, say once that the relay will not clear.
async function warnUnarmed($: Engine, r: Relay, reason: string): Promise<void> {
  if (r.limit === 0 || reason !== 'answer' || (await headlessRun($))) return
  const id = await $.session.id()
  if (!id || r.warned === id || !(await nudged($, id))) return
  r.warned = id
  $.ui.toast(UNARMED_TEXT, { timeoutMs: 20000 })
}

// The standing status entry: what is left while the relay is on, nothing while off.
const shown = (r: Relay) => (r.limit === 0 || r.headless ? undefined : relayStatus(r.limit, r.used))

// Write this window's state for the status bar. A failure never reaches the relay.
async function publish($: Engine, r: Relay): Promise<void> {
  try {
    if (await headlessRun($)) return
    const dir = await relayDir($)
    if (!dir) return
    const id = await $.session.id()
    if (id && r.sessions.at(-1) !== id) r.sessions.push(id)
    if (r.sessions.length > 100) r.sessions.splice(0, r.sessions.length - 100)
    const file: RelayFile = {
      v: 1,
      key: r.key,
      cwd: await $.session.cwd(),
      sessions: r.sessions,
      limit: asJson(r.limit),
      configured: asJson(r.configured),
      used: r.used,
      stalled: r.stalled,
      applied: r.applied,
      updatedAt: Date.now(),
    }
    await $.fs.write(`${dir}/${r.key}.json`, JSON.stringify(file))
  } catch {
    // The status bar is a view; the relay works without it.
  }
}

// A new budget for this window: the count and the stall guard start over.
function setLimit(r: Relay, limit: number, at: number): void {
  r.applied = at
  r.limit = limit
  r.used = 0
  r.stalled = 0
  r.lastHead = undefined
  if (limit === 0) r.pending = false
}

// A budget set from the status bar, newer than the last one taken, replaces this
// window's budget.
async function takeOverride($: Engine, r: Relay): Promise<void> {
  try {
    const dir = await relayDir($)
    if (!dir) return
    const set = JSON.parse(String(await $.fs.read(`${dir}/${r.key}.set.json`)))
    if (typeof set?.at !== 'number' || set.at <= r.applied) return
    setLimit(r, budget(set.limit), set.at)
    $.ui.status(shown(r))
  } catch {
    // No override file, or a bad one: keep the budget there is.
  }
}

// A hand-over request from the status bar, newer than the last one taken: run the
// handover skill. Queued until the session is idle, so a click mid-turn waits.
async function takeHandover($: Engine, r: Relay): Promise<void> {
  let at: unknown
  try {
    const dir = await relayDir($)
    if (!dir) return
    at = JSON.parse(String(await $.fs.read(`${dir}/${r.key}.handover.json`)))?.at
  } catch {
    // No request file, or a bad one: nothing asked.
    return
  }
  if (typeof at !== 'number' || at <= r.asked) return
  r.asked = at
  $.ui.toast('clear-resume: writing a handover', { timeoutMs: 5000 })
  try {
    await $.command.run({ command: HANDOVER_COMMAND, args: '' })
  } catch {
    await $.prompt.submit({ text: HANDOVER_TEXT, asUser: true }).catch(err => {
      $.ui.toast(`clear-resume: hand-over refused: ${String(err)}`, { timeoutMs: 15000 })
    })
  }
}

// Start the poll once per process, from whichever of session.start and the first
// turn's end comes first. Not under the headless runner, which has no button.
async function poll($: Engine, r: Relay): Promise<void> {
  if (r.polling) return
  r.polling = true
  if (await headlessRun($)) return
  let busy = false
  $.clock.every(POLL_MS, () => {
    if (busy) return
    busy = true
    void takeHandover($, r).finally(() => {
      busy = false
    })
  })
}

// What the end of a main-thread turn does with a pending save.
async function decide($: Engine, r: Relay, reason: string): Promise<void> {
  if (!r.pending) return warnUnarmed($, r, reason)
  // Turned off for this window: drop the save quietly.
  if (r.limit === 0) {
    r.pending = false
    return
  }
  // The headless runner (run.mjs) ends the process instead; it has its own budget.
  if (await headlessRun($)) {
    r.pending = false
    return
  }
  // An interrupted or failed turn is the user's to finish: do not clear under them.
  if (reason !== 'answer') {
    r.pending = false
    return
  }
  if (r.used >= r.limit) {
    r.pending = false
    $.ui.toast(`clear-resume relay: budget of ${r.limit} used. Type /clear to continue from the handover.`, {
      timeoutMs: 15000,
    })
    return
  }
  const head = await headOf($)
  r.stalled = head !== undefined && head === r.lastHead ? r.stalled + 1 : 0
  r.lastHead = head
  if (r.stalled >= 2) {
    r.pending = false
    $.ui.toast(
      'clear-resume relay: stopped. Two continued sessions in a row made no new commit. Type /clear to continue from the handover.',
      { timeoutMs: 15000 },
    )
    return
  }
  r.used++
  $.ui.status('clear-resume: clearing...')
  // Not awaited: command.run rejects inside a hook the turn is waiting on,
  // and the clear is queued until the session is idle anyway.
  $.clock.after(300, () => {
    $.command.run({ command: 'clear' }).catch(err => {
      r.pending = false
      $.ui.status(shown(r))
      $.ui.toast(`clear-resume relay: /clear refused: ${String(err)}`, { timeoutMs: 15000 })
    })
  })
}

export const register: Register = (on, options) => {
  // Off still registers: /relay and the status bar can turn it on for this window.
  const configured = budget(options.relay)
  const r: Relay = {
    configured,
    limit: configured,
    key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sessions: [],
    applied: 0,
    used: 0,
    pending: false,
    lastHead: undefined,
    stalled: 0,
    headless: false,
    asked: 0,
    polling: false,
    warned: undefined,
  }

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    r.headless = await headlessRun($)
    await $.command.register({
      name: 'relay',
      description: 'Clear and continue by itself in this window: off, on, unlimited or a number',
      argumentHint: '[off|on|unlimited|<n>]',
      immediate: true,
    })
    $.ui.status(shown(r))
    await publish($, r)
    await poll($, r)
    return result
  })

  // Bare /relay reports; with an argument it sets this window's budget and starts
  // the count and the stall guard over. Typed later than any status-bar choice not
  // yet taken, so it wins over that one.
  on('command.run', { command: 'relay' }, async ($, e) => {
    if (e.args.trim() === '') return { text: relayStatus(r.limit, r.used) }
    const set = parseRelay(e.args, configured)
    if (set === undefined) return { text: `relay: "${e.args.trim()}" not understood. Use off, on, unlimited or a number.` }
    setLimit(r, set, Date.now())
    $.ui.status(shown(r))
    await publish($, r)
    return { text: relayStatus(r.limit, r.used) }
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
      r.pending = true
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    await takeOverride($, r)
    await decide($, r, e.reason)
    await publish($, r)
    await poll($, r)
    return result
  })

  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason !== 'clear' || !r.pending) return result
    r.pending = false
    $.ui.status('clear-resume: continuing...')
    $.clock.after(1000, () => {
      $.prompt
        .submit({ text: RESUME_TEXT, asUser: true })
        .then(() => {
          $.ui.status(shown(r))
          // The VS Code panel draws no status line; a toast is the count it can show.
          $.ui.toast(`clear-resume ${relayStatus(r.limit, r.used)}`, { timeoutMs: 8000 })
          return publish($, r)
        })
        .catch(err => {
          $.ui.status(shown(r))
          $.ui.toast(`clear-resume relay: submit refused: ${String(err)}`, { timeoutMs: 15000 })
        })
    })
    return result
  })
}
