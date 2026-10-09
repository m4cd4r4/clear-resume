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

// Idle handover. The prompt cache lasts cache_ttl_minutes after the last reply;
// a handover written before it lapses is read from the cache, one written after
// pays a full rewrite of the context. The mod acts IDLE_MARGIN_MS before the lapse
// (or half the TTL when the TTL is short), and only once the context is large.
// Measured once (n=1, Sonnet 5.5, 390k tokens): README, "Idle handover".
export const IDLE_MARGIN_MS = 5 * 60_000
export const IDLE_TICK_MS = 30_000
export const DEFAULT_TTL_MIN = 60
export const DEFAULT_IDLE_MIN_TOKENS = 100_000
export type IdleMode = 'off' | 'toast' | 'auto'
// auto submits a prompt while the user is away; with a short TTL the window is too
// narrow to trust that, so it behaves as toast (see idleEffective).
export const AUTO_MIN_TTL_MIN = 10

// What the idle handover asks for. Unlike the 180k nudge nobody is at the keyboard,
// so the fresh session must wait for the user rather than carry on.
export const IDLE_HANDOVER_TEXT =
  HANDOVER_TEXT + ' The user is away. If a question is open, the Next action is to wait for their answer; do not guess.'

// "toast" or "auto"; anything else, or unset, is off.
export function idleMode(raw: unknown): IdleMode {
  const s = String(raw ?? 'off').trim().toLowerCase()
  return s === 'toast' || s === 'auto' ? s : 'off'
}

// A positive number from an option, else the default.
export function positive(raw: unknown, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// How long after the last reply the mod acts, in ms: the TTL less the margin.
export function idleFireAfterMs(ttlMin: number): number {
  const ttl = ttlMin * 60_000
  return ttl - Math.min(IDLE_MARGIN_MS, ttl / 2)
}

// True while the cache is about to expire but has not: from the fire time up to
// the TTL. Past the TTL a handover would pay the full rewrite itself.
export function idleDue(idleMs: number, ttlMin: number): boolean {
  return idleMs >= idleFireAfterMs(ttlMin) && idleMs < ttlMin * 60_000
}

// A gap far past one tick since the last look means the machine was asleep.
export function idleWoke(lastTickAt: number | undefined, now: number): boolean {
  return lastTickAt !== undefined && now - lastTickAt > 2 * IDLE_TICK_MS
}

// auto needs a TTL of at least AUTO_MIN_TTL_MIN; below that it is toast.
export function idleEffective(mode: IdleMode, ttlMin: number): IdleMode {
  return mode === 'auto' && ttlMin < AUTO_MIN_TTL_MIN ? 'toast' : mode
}

export const idleToast = (leftMin: number): string =>
  `clear-resume: the prompt cache expires in about ${Math.max(1, Math.round(leftMin))} min. ` +
  'Measured once: a handover now was about 5x cheaper than resuming cold. Run /clear-resume:handover, then /clear.'

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
  // Idle handover: the settings, the clock reading and context size at the end of
  // the last main-thread reply, tool calls and turns now running, and the timer.
  idle: IdleMode
  ttlMin: number
  minTokens: number
  lastReplyAt: number | undefined
  // Tool calls in flight, and the ids of turns running (a Set: a subagent's turn
  // can start and end inside the main one).
  tools: number
  turns: Set<string>
  ticking: boolean
  // The clock reading at the last tick, to tell a machine that just woke.
  lastTickAt: number | undefined
  // False when session.start said this is not an interactive session.
  interactive: boolean
  // A save went through save.mjs this session, so idle has nothing to ask for.
  saved: boolean
  // The idle handover was asked for by prompt: its save clears and does not resume.
  idleAsked: boolean
  // The idle status entry is showing, until the next turn starts.
  idleShown: boolean
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

// The context size after the last reply. $.session.usage() has it; if the host
// has no figure (older builds), read the transcript the way the Stop-hook nudge
// does, through the same function (scripts/lib/nudge.mjs, run as
// scripts/context-tokens.mjs because a mod may not import node:fs). Undefined when
// neither knows: the idle handover then stays quiet.
async function contextTokens($: Engine): Promise<number | undefined> {
  try {
    const t = (await $.session.usage())?.context?.tokens
    if (typeof t === 'number' && Number.isFinite(t)) return t
  } catch {
    // No usage on this build: fall through to the transcript.
  }
  try {
    const id = await $.session.id()
    const cwd = await $.session.cwd()
    const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'))
    const cfg = (await $.env.get('CLAUDE_CONFIG_DIR')) || (home ? `${home.replace(/[/\\]+$/, '')}/.claude` : '')
    if (!id || !cwd || !cfg) return undefined
    const file = `${cfg.replace(/[/\\]+$/, '')}/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${id}.jsonl`
    const r = await $.process.run(['node', `${$.plugin.root}/scripts/context-tokens.mjs`, file], { timeoutMs: 15000 })
    const t = r.exitCode === 0 ? Number(r.stdout.trim()) : NaN
    return Number.isFinite(t) && t > 0 ? t : undefined
  } catch {
    return undefined
  }
}

// Claim the idle handover's own once-per-session mark, <store>/.idle/<slug>. It is
// not the .nudged mark: the 180k Stop nudge and this can each fire once. True when
// this call made the mark; false when it was there already or cannot be written
// (then do nothing rather than repeat).
async function claimIdle($: Engine, id: string): Promise<boolean> {
  const dir = await relayDir($)
  const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
  if (!dir || !slug) return false
  const mark = `${dir.replace(/[/\\]relay$/, '')}/.idle/${slug}`
  try {
    await $.fs.read(mark)
    return false
  } catch {
    // Not there yet: claim it.
  }
  try {
    await $.fs.write(mark, new Date().toISOString())
    return true
  } catch {
    return false
  }
}

// Forget the idle state: a new conversation, or one just compacted, starts over.
function resetIdle(r: Relay): void {
  r.lastReplyAt = undefined
  r.lastTickAt = undefined
  r.turns.clear()
  r.saved = false
  r.idleAsked = false
}

// One look at the idle state. Acts at most once per session.
async function idleCheck($: Engine, r: Relay): Promise<void> {
  const now = await $.clock.now()
  // A gap far past one tick means the machine was asleep: the cache clock moved
  // while this one did not, so nothing is submitted on that look.
  const woke = idleWoke(r.lastTickAt, now)
  r.lastTickAt = now
  if (r.idle === 'off' || r.lastReplyAt === undefined || !r.interactive) return
  if (r.turns.size > 0 || r.saved || r.pending || r.idleAsked) return
  const idle = now - r.lastReplyAt
  if (!idleDue(idle, r.ttlMin) || (await headlessRun($))) return
  // Read the context size only now that everything else says to act.
  const tokens = await contextTokens($)
  if (tokens === undefined || tokens < r.minTokens) return
  const id = await $.session.id()
  if (!id || !(await claimIdle($, id))) return
  const left = Math.max(1, Math.round((r.ttlMin * 60_000 - idle) / 60_000))
  // Auto needs a quiet session: a tool call in flight may be waiting on a
  // permission prompt, and a submitted prompt would queue behind it. Message then.
  if (r.idle === 'auto' && r.tools === 0 && !woke) {
    r.idleAsked = true
    $.ui.toast(`clear-resume: idle, the cache expires in about ${left} min. Writing a handover now.`, { timeoutMs: 10000 })
    await $.prompt.submit({ text: IDLE_HANDOVER_TEXT, asUser: true }).catch(err => {
      r.idleAsked = false
      $.ui.toast(`clear-resume: idle handover refused: ${String(err)}`, { timeoutMs: 15000 })
    })
    return
  }
  // The message stays in the status line until the next turn starts. It is the
  // user's to act on, so the toast is only a nudge to look.
  r.idleShown = true
  $.ui.status(idleToast(left))
  $.ui.toast(idleToast(left), { timeoutMs: 8000 })
}

// The idle check's timer, once per process. Not under the headless runner.
async function idleTick($: Engine, r: Relay): Promise<void> {
  if (r.ticking || r.idle === 'off') return
  r.ticking = true
  if (await headlessRun($)) return
  let busy = false
  $.clock.every(IDLE_TICK_MS, () => {
    if (busy) return
    busy = true
    void idleCheck($, r)
      .catch(() => {})
      .finally(() => {
        busy = false
      })
  })
}

// What the end of a main-thread turn does with a pending save.
async function decide($: Engine, r: Relay, reason: string): Promise<void> {
  if (!r.pending) {
    // The turn the idle prompt started ended with nothing saved: drop the ask.
    r.idleAsked = false
    return warnUnarmed($, r, reason)
  }
  // An idle handover saves and clears, whatever the relay's budget, and does not
  // continue: the user is away, so the fresh session waits for them. The saved
  // handover still loads at the start of the new session.
  if (r.idleAsked) {
    r.idleAsked = false
    r.pending = false
    if (reason !== 'answer' || (await headlessRun($))) return
    $.ui.status('clear-resume: clearing...')
    $.clock.after(300, () => {
      $.command.run({ command: 'clear' }).catch(err => {
        $.ui.status(shown(r))
        $.ui.toast(`clear-resume idle handover: /clear refused: ${String(err)}`, { timeoutMs: 15000 })
      })
    })
    return
  }
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
    idle: idleEffective(idleMode(options.idle_handover), positive(options.cache_ttl_minutes, DEFAULT_TTL_MIN)),
    ttlMin: positive(options.cache_ttl_minutes, DEFAULT_TTL_MIN),
    minTokens: positive(options.idle_min_tokens, DEFAULT_IDLE_MIN_TOKENS),
    lastReplyAt: undefined,
    tools: 0,
    turns: new Set(),
    ticking: false,
    lastTickAt: undefined,
    interactive: true,
    saved: false,
    idleAsked: false,
    idleShown: false,
  }

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    r.headless = await headlessRun($)
    resetIdle(r)
    // A session that is not interactive (-p, the SDK) has nobody to message.
    r.interactive = (e as { isInteractive?: boolean }).isInteractive !== false
    await $.command.register({
      name: 'relay',
      description: 'Clear and continue by itself in this window: off, on, unlimited or a number',
      argumentHint: '[off|on|unlimited|<n>]',
      immediate: true,
    })
    $.ui.status(shown(r))
    await publish($, r)
    await poll($, r)
    await idleTick($, r)
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

  // Only with the idle handover on: count tool calls in flight, any thread (one
  // may be waiting on a permission prompt), and turns running. With it off these
  // hooks are not registered at all.
  if (r.idle !== 'off') {
    on('tool.call', async ($, e, next) => {
      r.tools++
      try {
        return await next(e)
      } finally {
        r.tools = Math.max(0, r.tools - 1)
      }
    })

    on('turn.start', async ($, e, next) => {
      r.turns.add(e.turnId)
      // The idle message stays until the user is back and a turn starts.
      r.idleShown = false
      $.ui.status(shown(r))
      return next(e)
    })
  }

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
      r.saved = true
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // Any thread's turn ends here, so its id leaves the running set.
    r.turns.delete(e.turnId)
    if (e.agentId !== undefined) return result
    // Only a turn that answered counts as the user's last reply: an aborted or
    // failed one did not refresh the cache the way a finished request does.
    if (r.idle !== 'off' && e.reason === 'answer') r.lastReplyAt = await $.clock.now()
    await takeOverride($, r)
    await decide($, r, e.reason)
    await publish($, r)
    await poll($, r)
    await idleTick($, r)
    return result
  })

  // A compacted conversation is a new, small one: the idle state starts over.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) resetIdle(r)
    return result
  })

  on('session.end', async ($, e, next) => {
    const result = await next(e)
    resetIdle(r)
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
