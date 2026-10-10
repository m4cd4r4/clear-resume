// The relay mod (plugin/hooks/relay.ts), under `claude plugin test`. Not vitest:
// scripts/test-mod.mjs copies plugin/ and this file into a scratch folder, so the
// shipped plugin carries no tests (test/plugin-footprint.test.mjs).
//
// tdd-guard:allow - backfilled onto a module ported from a spike proven by hand in
// VS Code on 2026-10-03 (clear, session.end 'clear', submit after it). Each case
// was then seen to fail by breaking the line of relay.ts it guards.
//
// The test's own hooks sit beneath the mod and stand for the engine: they answer
// the Bash call, the turn's end, /clear and the submitted prompt, and record what
// the mod asked for.
import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import {
  IDLE_HANDOVER_TEXT,
  IDLE_MARGIN_MS,
  IDLE_TICK_MS,
  idleDue,
  idleEffective,
  idleFireAfterMs,
  idleMode,
  idleToast,
  idleWoke,
  positive,
} from './relay'

const SAVE = 'node "C:/Users/me/.claude/plugins/cache/clear-resume/scripts/save.mjs" --title "x" <<\'EOF\''
const SAVED = 'Saved handover "x" (id abc123).'

type World = {
  commands: string[]
  prompts: string[]
  toasts: string[]
  status: (string | undefined)[]
  registered: string[]
  files: Map<string, string>
}

// The relay's state file: <home>/.clear-resume/relay/<key>.json, not the .set.json
// override or the .handover.json request. The engine resolves the path before a
// hook sees it, so on Windows it is C:\home\me\...
const STATE = /[\\/]relay[\\/][^\\/]+(?<!\.set|\.handover)\.json$/

function world(on: On, env: Record<string, string> = {}) {
  const w: World = { commands: [], prompts: [], toasts: [], status: [], registered: [], files: new Map() }
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/home/me', ...env })
  // The state file and the status bar's override, in memory.
  on('fs.write', async ($, e) => {
    w.files.set(e.path, e.text)
    return { value: undefined }
  })
  // Sessions the nudge has marked (<store>/.nudged/<id>, scripts/lib/nudge.mjs).
  const nudgedIds = new Set<string>()
  on('fs.read', async ($, e) => {
    const mark = /[\\/]\.clear-resume[\\/]\.nudged[\\/]([^\\/]+)$/.exec(e.path)
    if (mark && nudgedIds.has(mark[1])) return { value: '2026-10-07T10:00:00Z' }
    const text = w.files.get(e.path)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: text }
  })
  let sessionId = 's1'
  on('session.id', async () => ({ value: sessionId }))
  on('session.cwd', async () => ({ value: '/repo' }))
  let out = SAVED
  let isError = false
  // git rev-parse HEAD: a fixed commit unless a test moves it; null stands for no git.
  let head: string | null = 'c0'
  // The transcript reading the idle handover falls back to (scripts/context-tokens.mjs):
  // the files it was given, and what the file holds (null: no assistant call in it).
  const transcripts: string[] = []
  let transcriptTokens: number | null = null
  on('process.run', async (_$, e) => {
    if (/context-tokens\.mjs$/.test(String(e.argv[1]))) {
      transcripts.push(String(e.argv[2]))
      return {
        value:
          transcriptTokens === null
            ? { exitCode: 1, stdout: '', stderr: '' }
            : { exitCode: 0, stdout: `${transcriptTokens}\n`, stderr: '' },
      }
    }
    return {
      value:
        head === null
          ? { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }
          : { exitCode: 0, stdout: `${head}\n`, stderr: '' },
    }
  })
  // A tool call held open, as one waiting on a permission prompt is.
  let hold: Promise<void> | null = null
  on('tool.call', { tool: 'Read' }, async () => {
    await hold
    return { result: {}, text: '' }
  })
  on('tool.call', { tool: 'Bash' }, async () =>
    isError
      ? { result: { stdout: '', stderr: out, interrupted: false }, text: out, isError: true }
      : { result: { stdout: out, stderr: '', interrupted: false }, text: out },
  )
  on('turn.complete', async ($, e) => ({ text: e.answer }))
  on('turn.start', async ($, e) => ({ turnId: e.turnId }))
  // $.session.usage(): the context size after the last reply; null stands for a
  // host with no such call.
  let context: number | null = 200_000
  on('session.usage', async () => {
    if (context === null) throw new Error('unknown call: session.usage')
    return { value: { startedAt: 0, context: { tokens: context, window: 1_000_000 }, rateLimits: [] } }
  })
  on('session.end', async ($, e) => ({ sessionId: e.sessionId }))
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('session.compact', async ($, e) => ({ messages: e.messages }))
  // Commands the host refuses, as it does an unknown name.
  const refused = new Set<string>()
  on('command.run', async ($, e) => {
    if (refused.has(e.command)) throw new Error(`unknown command: ${e.command}`)
    w.commands.push(e.command)
    return { text: '' }
  })
  on('prompt.submit', async ($, e) => {
    w.prompts.push(e.text)
    return { text: e.text }
  })
  on('ui.status', async ($, e) => {
    w.status.push(e.text)
    return { value: undefined }
  })
  on('command.register', async ($, e) => {
    w.registered.push(e.name)
    return { value: undefined }
  })
  on('ui.toast', async ($, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  return {
    w,
    clock,
    reply: (text: string, error = false) => {
      out = text
      isError = error
    },
    commit: (sha: string | null) => {
      head = sha
    },
    nextSession: (id: string) => {
      sessionId = id
    },
    context: (tokens: number | null, fromTranscript: number | null = null) => {
      context = tokens
      transcriptTokens = fromTranscript
    },
    transcripts,
    hold: (gate: Promise<void> | null) => {
      hold = gate
    },
    refuse: (command: string) => {
      refused.add(command)
    },
    nudge: (id: string) => {
      nudgedIds.add(id)
    },
    // The one state file the mod wrote, parsed.
    state: () => {
      const found = [...w.files].filter(([k]) => STATE.test(k))
      expect(found.length).toBe(1)
      return { path: found[0][0], file: JSON.parse(found[0][1]) }
    },
  }
}

// One relayed segment: save, end the turn, /clear, continue.
async function relayOnce($: Parameters<Parameters<typeof test>[1]>[0], clock: { advance: (ms: number) => Promise<void> }) {
  await $.tool.call({ tool: 'Bash', command: SAVE })
  await $.turn.complete(turn)
  await clock.advance(300)
  await $.session.end(cleared)
  await clock.advance(1000)
}

const UNARMED =
  'clear-resume relay: no handover was saved with /clear-resume:handover after the context nudge, so the relay will not clear. ' +
  'If the work goes on, run /clear-resume:handover (another handover skill does not count), or type /clear.'

const turn = { answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const cleared = { reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as const

describe('relay', () => {
  test('off by default: a save clears nothing', async ($, on) => {
    const { w, clock } = world(on)
    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.turn.complete(turn)
    await clock.advance(5000)
    expect(w.commands).toEqual([])
    expect(w.toasts).toEqual([])
  })

  test('on: clears after the turn that saved, then submits the continue prompt', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock } = world(on)
    await $.tool.call({ tool: 'Bash', command: SAVE })
    expect(w.commands).toEqual([])
    await $.turn.complete(turn)
    expect(w.commands).toEqual([])
    await clock.advance(300)
    expect(w.commands).toEqual(['clear'])
    await $.session.end(cleared)
    expect(w.prompts).toEqual([])
    await clock.advance(1000)
    expect(w.prompts).toEqual(['Continue from the clear-resume handover that was just loaded.'])
  })

  test('a turn with no save does not clear', { options: { relay: 'unlimited' } }, async ($, on) => {
    const { w, clock, reply } = world(on)
    reply('ok')
    await $.tool.call({ tool: 'Bash', command: 'git status' })
    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.turn.complete(turn)
    await clock.advance(5000)
    expect(w.commands).toEqual([])
  })

  test('a failed save does not clear', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock, reply } = world(on)
    reply('Saved handover "x" (id abc123).', true)
    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.turn.complete(turn)
    await clock.advance(5000)
    expect(w.commands).toEqual([])
  })

  test('an interrupted turn is left to the user', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock } = world(on)
    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.turn.complete({ ...turn, reason: 'aborted', isAborted: true })
    await clock.advance(5000)
    expect(w.commands).toEqual([])
    // and the save does not carry over to the next turn
    await $.turn.complete(turn)
    await clock.advance(5000)
    expect(w.commands).toEqual([])
  })

  test("a subagent's save does not clear the main session", { options: { relay: '3' } }, async ($, on) => {
    const { w, clock } = world(on)
    // The input types leave agentId out of $.tool.call; the engine carries it to
    // the mod all the same (seen: dropping the mod's agentId check fails this).
    const fromSubagent = { tool: 'Bash', command: SAVE, agentId: 'a1' } as const
    await $.tool.call(fromSubagent)
    await $.turn.complete(turn)
    await clock.advance(5000)
    expect(w.commands).toEqual([])
  })

  test('a nudged turn that saves through another skill warns once that the relay will not clear', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock, reply, nudge } = world(on)
    reply('Handover saved: x. /clear - the next session loads it.')
    nudge('s1')
    await $.tool.call({ tool: 'Bash', command: 'node C:/Users/me/.claude/scripts/handover-save.js h.md' })
    await $.turn.complete(turn)
    await clock.advance(5000)
    expect(w.commands).toEqual([])
    expect(w.toasts).toEqual([UNARMED])
    await $.turn.complete(turn)
    expect(w.toasts).toEqual([UNARMED])
  })

  test('a nudged turn that saves with save.mjs clears with no warning', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock, nudge } = world(on)
    nudge('s1')
    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.turn.complete(turn)
    await clock.advance(300)
    expect(w.commands).toEqual(['clear'])
    expect(w.toasts).toEqual([])
  })

  test('relay off: a nudged turn with no save stays quiet', async ($, on) => {
    const { w, nudge } = world(on)
    nudge('s1')
    await $.turn.complete(turn)
    expect(w.toasts).toEqual([])
  })

  test('under the headless runner the relay stands aside', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock } = world(on, { CLEAR_RESUME_HEADLESS: '1' })
    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.turn.complete(turn)
    await clock.advance(5000)
    expect(w.commands).toEqual([])
  })

  test('stops at its budget and says so', { options: { relay: '1' } }, async ($, on) => {
    const { w, clock } = world(on)
    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.turn.complete(turn)
    await clock.advance(300)
    await $.session.end(cleared)
    await clock.advance(1000)
    expect(w.commands).toEqual(['clear'])

    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.turn.complete(turn)
    await clock.advance(5000)
    expect(w.commands).toEqual(['clear'])
    expect(w.toasts.some(t => t.includes('budget of 1 used'))).toBe(true)
  })

  test('stops after two continued sessions in a row make no new commit', { options: { relay: 'unlimited' } }, async ($, on) => {
    const { w, clock } = world(on)
    await relayOnce($, clock) // segment 1 ends: no earlier HEAD to compare with
    await relayOnce($, clock) // segment 2 made no commit: one stall
    expect(w.commands).toEqual(['clear', 'clear'])
    await relayOnce($, clock) // segment 3 made no commit: two stalls, stop
    expect(w.commands).toEqual(['clear', 'clear'])
    expect(w.toasts.some(t => t.includes('no new commit'))).toBe(true)
  })

  test('a commit between relays resets the stall count', { options: { relay: 'unlimited' } }, async ($, on) => {
    const { w, clock, commit } = world(on)
    await relayOnce($, clock)
    await relayOnce($, clock) // one stall
    commit('c1')
    await relayOnce($, clock) // new commit: stall count back to zero
    await relayOnce($, clock) // one stall again, not two
    expect(w.commands).toEqual(['clear', 'clear', 'clear', 'clear'])
  })

  test('with no git the stall guard stands aside and the budget still holds', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock, commit } = world(on)
    commit(null)
    for (let i = 0; i < 4; i++) await relayOnce($, clock)
    expect(w.commands).toEqual(['clear', 'clear', 'clear'])
    expect(w.toasts.some(t => t.includes('budget of 3 used'))).toBe(true)
    expect(w.toasts.some(t => t.includes('no new commit'))).toBe(false)
  })

  test('a /clear the user types with nothing pending submits nothing', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock } = world(on)
    await $.session.end(cleared)
    await clock.advance(5000)
    expect(w.prompts).toEqual([])
  })

  // tdd-guard:allow - the state file and override cases below were written beside
  // the code; each was then seen to fail by breaking the line of relay.ts it guards.
  test("publishes this window's state for the status bar", { options: { relay: '3' } }, async ($, on) => {
    const { clock, state, nextSession } = world(on)
    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.turn.complete(turn)
    await clock.advance(300)
    nextSession('s2')
    await $.session.end(cleared)
    await clock.advance(1000)
    const { path, file } = state()
    expect(path.replace(/\\/g, '/')).toMatch(/\/home\/me\/\.clear-resume\/relay\/[^/]+\.json$/)
    expect(file).toMatchObject({ v: 1, cwd: '/repo', limit: 3, configured: 3, used: 1, stalled: 0, sessions: ['s1', 's2'] })
  })

  test('off still publishes, so the status bar can turn it on', async ($, on) => {
    const { state } = world(on)
    await $.turn.complete(turn)
    expect(state().file).toMatchObject({ limit: 0, configured: 0, used: 0 })
  })

  test('a budget set from the status bar turns the relay on for this window', async ($, on) => {
    const { w, clock, state } = world(on)
    await $.turn.complete(turn)
    const { path } = state()
    w.files.set(path.replace(/\.json$/, '.set.json'), JSON.stringify({ limit: 'unlimited', at: 5 }))
    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.turn.complete(turn)
    await clock.advance(300)
    expect(w.commands).toEqual(['clear'])
    expect(state().file).toMatchObject({ limit: 'unlimited', configured: 0, used: 1, applied: 5 })
  })

  test('an override already taken is not taken again', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock, state } = world(on)
    await $.turn.complete(turn)
    w.files.set(state().path.replace(/\.json$/, '.set.json'), JSON.stringify({ limit: '1', at: 5 }))
    await relayOnce($, clock)
    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.turn.complete(turn)
    await clock.advance(5000)
    // The second save meets the budget of 1 instead of starting the count over.
    expect(w.commands).toEqual(['clear'])
    expect(w.toasts.some(t => t.includes('budget of 1 used'))).toBe(true)
  })

  test('under the headless runner no state is written', { options: { relay: '3' } }, async ($, on) => {
    const { w } = world(on, { CLEAR_RESUME_HEADLESS: '1' })
    await $.turn.complete(turn)
    expect(w.files.size).toBe(0)
  })
})

const start = { cwd: 'I:/repo', surface: 'terminal', isInteractive: true } as const
const relayCmd = (args: string) => ({ command: 'relay', args })

describe('/relay and the status line', () => {
  test('registers /relay and shows what is left at start', { options: { relay: '3' } }, async ($, on) => {
    const { w } = world(on)
    await $.session.start(start)
    expect(w.registered).toEqual(['relay'])
    expect(w.status.at(-1)).toBe('relay: 3 of 3 left')
  })

  test('off by option: no status entry, and bare /relay says off', async ($, on) => {
    const { w } = world(on)
    await $.session.start(start)
    expect(w.status.at(-1)).toBeUndefined()
    const r = await $.command.run(relayCmd(''))
    expect(r.text).toBe('relay: off')
  })

  test('/relay 2 turns it on for this window when the option is off', async ($, on) => {
    const { w, clock } = world(on)
    await $.session.start(start)
    const r = await $.command.run(relayCmd('2'))
    expect(r.text).toBe('relay: 2 of 2 left')
    await relayOnce($, clock)
    expect(w.commands).toEqual(['clear'])
    expect(w.prompts.length).toBe(1)
    expect(w.status.at(-1)).toBe('relay: 1 of 2 left')
  })

  test('/relay off stops a relay the option turned on, and clears the status', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock } = world(on)
    await $.session.start(start)
    await $.command.run(relayCmd('off'))
    expect(w.status.at(-1)).toBeUndefined()
    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.turn.complete(turn)
    await clock.advance(5000)
    expect(w.commands).toEqual([])
    expect(w.toasts).toEqual([])
  })

  test('/relay off between the save and the turn end cancels that clear', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock } = world(on)
    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.command.run(relayCmd('off'))
    await $.turn.complete(turn)
    await clock.advance(5000)
    expect(w.commands).toEqual([])
  })

  test('/relay on uses the option budget, or 3 when the option is off', { options: { relay: '5' } }, async ($, on) => {
    world(on)
    await $.command.run(relayCmd('off'))
    expect((await $.command.run(relayCmd('on'))).text).toBe('relay: 5 of 5 left')
  })

  test('/relay on with the option off means 3', async ($, on) => {
    world(on)
    expect((await $.command.run(relayCmd('on'))).text).toBe('relay: 3 of 3 left')
  })

  test('/relay unlimited', async ($, on) => {
    world(on)
    expect((await $.command.run(relayCmd('unlimited'))).text).toBe('relay: on, unlimited (0 used)')
  })

  test('an argument it does not understand changes nothing', { options: { relay: '3' } }, async ($, on) => {
    world(on)
    const r = await $.command.run(relayCmd('lots'))
    expect(r.text).toContain('not understood')
    expect((await $.command.run(relayCmd(''))).text).toBe('relay: 3 of 3 left')
  })

  test('setting a budget starts the count over after it ran out', { options: { relay: '1' } }, async ($, on) => {
    const { w, clock } = world(on)
    await relayOnce($, clock)
    expect((await $.command.run(relayCmd(''))).text).toBe('relay: 0 of 1 left')
    await $.command.run(relayCmd('1'))
    await relayOnce($, clock)
    expect(w.commands).toEqual(['clear', 'clear'])
  })

  test('under the headless runner there is no status entry', { options: { relay: '3' } }, async ($, on) => {
    const { w } = world(on, { CLEAR_RESUME_HEADLESS: '1' })
    await $.session.start(start)
    expect(w.status.every(t => t === undefined)).toBe(true)
  })

  test('each continue toasts what is left, for the VS Code panel which draws no status line', { options: { relay: '2' } }, async ($, on) => {
    const { w, clock } = world(on)
    await relayOnce($, clock)
    expect(w.toasts).toEqual(['clear-resume relay: 1 of 2 left'])
    await relayOnce($, clock)
    expect(w.toasts).toEqual(['clear-resume relay: 1 of 2 left', 'clear-resume relay: 0 of 2 left'])
  })

  test('/relay typed after a status-bar choice not yet taken wins over it', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock, state } = world(on)
    await $.session.start(start)
    w.files.set(state().path.replace(/\.json$/, '.set.json'), JSON.stringify({ limit: 'off', at: Date.now() }))
    await clock.advance(10)
    await $.command.run(relayCmd('2'))
    await relayOnce($, clock)
    expect(w.commands).toEqual(['clear'])
    expect(state().file).toMatchObject({ limit: 2, used: 1 })
  })

  test('/relay publishes at once, so the status bar follows it', async ($, on) => {
    const { state } = world(on)
    await $.command.run(relayCmd('2'))
    expect(state().file).toMatchObject({ limit: 2, used: 0 })
  })
})

// tdd-guard:allow - written beside the code; each case was then seen to fail by
// breaking the line of relay.ts it guards.
describe('the status bar hand-over button', () => {
  // What the extension writes on a click, beside this window's state file.
  const click = (w: World, statePath: string, at: number) =>
    w.files.set(statePath.replace(/\.json$/, '.handover.json'), JSON.stringify({ at }))

  test('a click runs the handover skill, once', async ($, on) => {
    const { w, clock, state } = world(on)
    await $.session.start(start)
    click(w, state().path, 5)
    expect(w.commands).toEqual([])
    await clock.advance(1000)
    expect(w.commands).toEqual(['clear-resume:handover'])
    await clock.advance(5000)
    expect(w.commands).toEqual(['clear-resume:handover'])
    // A second click is a newer request.
    click(w, state().path, 6)
    await clock.advance(1000)
    expect(w.commands).toEqual(['clear-resume:handover', 'clear-resume:handover'])
  })

  test('with the relay on, the save it makes clears and continues', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock, state } = world(on)
    await $.session.start(start)
    click(w, state().path, 5)
    await clock.advance(1000)
    await relayOnce($, clock)
    expect(w.commands).toEqual(['clear-resume:handover', 'clear'])
    expect(w.prompts).toEqual(['Continue from the clear-resume handover that was just loaded.'])
  })

  test('the poll survives /clear', { options: { relay: '3' } }, async ($, on) => {
    const { w, clock, state } = world(on)
    await $.session.start(start)
    await relayOnce($, clock)
    click(w, state().path, 5)
    await clock.advance(1000)
    expect(w.commands).toEqual(['clear', 'clear-resume:handover'])
  })

  test('starts from the first turn end when no session.start was seen', async ($, on) => {
    const { w, clock, state } = world(on)
    await $.turn.complete(turn)
    click(w, state().path, 5)
    await clock.advance(1000)
    expect(w.commands).toEqual(['clear-resume:handover'])
  })

  test('one poll, however many starts', async ($, on) => {
    const { w, clock, state } = world(on)
    await $.session.start(start)
    await $.session.start(start)
    await $.turn.complete(turn)
    click(w, state().path, 5)
    await clock.advance(1000)
    expect(w.commands).toEqual(['clear-resume:handover'])
  })

  test('a refused command falls back to a prompt', async ($, on) => {
    const { w, clock, state, refuse } = world(on)
    refuse('clear-resume:handover')
    await $.session.start(start)
    click(w, state().path, 5)
    await clock.advance(1000)
    expect(w.prompts).toEqual(['Write a clear-resume handover now, with the /clear-resume:handover skill.'])
  })

  test('a bad request file asks for nothing', async ($, on) => {
    const { w, clock, state } = world(on)
    await $.session.start(start)
    w.files.set(state().path.replace(/\.json$/, '.handover.json'), 'not json')
    await clock.advance(3000)
    expect(w.commands).toEqual([])
  })

  test('under the headless runner there is no poll', async ($, on) => {
    const { w, clock } = world(on, { CLEAR_RESUME_HEADLESS: '1' })
    await $.session.start(start)
    w.files.set('/home/me/.clear-resume/relay/any.handover.json', JSON.stringify({ at: 5 }))
    await clock.advance(3000)
    expect(w.commands).toEqual([])
  })
})

describe('idle handover', () => {
  // The mock clock ticks every wait due on the way, and the relay polls once a
  // second, so toast tests use a 2 minute cache lifetime: the mod acts at 60 s
  // idle (the margin is half the TTL, being under 10 minutes) and the cache is
  // gone at 120 s. auto needs a TTL of 10 minutes or more: it acts at 300 s.
  // The 60 minute default is checked as arithmetic below.
  const S = 1000
  const opts = (mode: string, more: Record<string, string | number> = {}) => ({
    options: { idle_handover: mode, cache_ttl_minutes: 2, ...more },
  })
  const auto = (more: Record<string, string | number> = {}) => ({
    options: { idle_handover: 'auto', cache_ttl_minutes: 10, ...more },
  })
  const marks = (w: { files: Map<string, string> }, dir: string) =>
    [...w.files.keys()].filter(k => k.split('\\').join('/').includes(`/${dir}/`))

  test('the margin: 5 minutes before a 60 minute cache expires, half of a short one', () => {
    expect(idleFireAfterMs(60)).toBe(55 * 60 * S)
    expect(idleFireAfterMs(5)).toBe(2.5 * 60 * S)
    expect(idleFireAfterMs(2)).toBe(60 * S)
    expect(IDLE_MARGIN_MS).toBe(5 * 60 * S)
  })

  test('options: modes and numbers fall back to the defaults', () => {
    expect(['toast', 'AUTO', ' off ', 'on', '', undefined].map(idleMode)).toEqual(['toast', 'auto', 'off', 'off', 'off', 'off'])
    expect(positive('90', 60)).toBe(90)
    expect([positive('', 60), positive('x', 60), positive(-1, 60), positive(undefined, 60)]).toEqual([60, 60, 60, 60])
  })

  test('auto needs a TTL of 10 minutes or more; below that it is toast', () => {
    expect(idleEffective('auto', 9)).toBe('toast')
    expect(idleEffective('auto', 10)).toBe('auto')
    expect(idleEffective('toast', 60)).toBe('toast')
    expect(idleEffective('off', 5)).toBe('off')
  })

  test('a gap far past one tick means the machine woke', () => {
    expect(idleWoke(undefined, 1_000_000)).toBe(false)
    expect(idleWoke(0, IDLE_TICK_MS)).toBe(false)
    expect(idleWoke(0, 2 * IDLE_TICK_MS)).toBe(false)
    expect(idleWoke(0, 2 * IDLE_TICK_MS + 1)).toBe(true)
  })

  test('no fire once the cache has expired: the check is a window, not a floor', () => {
    const f = (idleMs: number) => idleDue(idleMs, 60)
    expect([f(54 * 60 * S), f(55 * 60 * S), f(59 * 60 * S), f(60 * 60 * S), f(3 * 3600 * S)]).toEqual([false, true, true, false, false])
  })

  test('off: nothing happens however long the chat sits idle', async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(100 * S)
    expect(w.toasts).toEqual([])
    expect(w.prompts).toEqual([])
  })

  test('toast: fires once, in the window before the cache expires', opts('toast'), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(50 * S)
    expect(w.toasts).toEqual([])
    await clock.advance(20 * S)
    expect(w.toasts).toEqual([idleToast(1)])
    expect(w.prompts).toEqual([])
    await clock.advance(40 * S)
    expect(w.toasts.length).toBe(1)
  })

  test('the toast text states the single measurement', () => {
    expect(idleToast(5)).toContain('Measured once')
    expect(idleToast(5)).toContain('about 5x cheaper')
  })

  test('toast: the message stays in the status line until the next turn starts', opts('toast'), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(70 * S)
    expect(w.status.at(-1)).toBe(idleToast(1))
    await clock.advance(40 * S)
    expect(w.status.at(-1)).toBe(idleToast(1))
    await $.turn.start({ text: 'back', turnId: 't2' })
    expect(w.status.at(-1)).toBeUndefined()
  })

  test('no fire below idle_min_tokens, and the size is read only when the window is due', opts('toast'), async ($, on) => {
    const { w, clock, context, transcripts } = world(on)
    context(null, 99_999)
    await $.turn.complete(turn)
    expect(transcripts).toEqual([])
    await clock.advance(50 * S)
    expect(transcripts).toEqual([])
    await clock.advance(50 * S)
    expect(transcripts.length).toBeGreaterThan(0)
    expect(w.toasts).toEqual([])
  })

  test('idle_min_tokens is read from the option', opts('toast', { idle_min_tokens: 300000 }), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(100 * S)
    expect(w.toasts).toEqual([])
  })

  test('it has its own mark: a session the 180k nudge marked still gets the idle message, and .nudged is left alone', opts('toast'), async ($, on) => {
    const { w, clock, nudge } = world(on)
    nudge('s1')
    await $.turn.complete(turn)
    await clock.advance(70 * S)
    expect(w.toasts.length).toBe(1)
    expect(marks(w, '.idle').length).toBe(1)
    expect(marks(w, '.nudged')).toEqual([])
  })

  test('a handover already saved this session means nothing to ask for', opts('toast'), async ($, on) => {
    const { w, clock } = world(on)
    await $.tool.call({ tool: 'Bash', command: SAVE })
    await $.turn.complete(turn)
    await clock.advance(100 * S)
    expect(w.toasts).toEqual([])
  })

  test('auto: submits the idle handover request, which says the user is away, once', auto(), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(310 * S)
    expect(w.prompts).toEqual([IDLE_HANDOVER_TEXT])
    expect(IDLE_HANDOVER_TEXT).toContain('The user is away. If a question is open, the Next action is to wait for their answer; do not guess.')
    await clock.advance(100 * S)
    expect(w.prompts).toEqual([IDLE_HANDOVER_TEXT])
  })

  test('auto: saves and clears, and does not submit the resume text (relay off)', auto(), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(310 * S)
    await relayOnce($, clock)
    expect(w.commands).toEqual(['clear'])
    expect(w.prompts).toEqual([IDLE_HANDOVER_TEXT])
  })

  test('auto: with the relay on it still clears without resuming, and the budget is not spent', auto({ relay: '3' }), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(310 * S)
    await relayOnce($, clock)
    expect(w.commands).toEqual(['clear'])
    expect(w.prompts).toEqual([IDLE_HANDOVER_TEXT])
    expect(w.toasts.some(t => t.includes('left'))).toBe(false)
  })

  test('auto: an idle ask that saved nothing leaves the next save to the normal relay', auto({ relay: '3' }), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(310 * S)
    await $.turn.complete(turn)
    await relayOnce($, clock)
    expect(w.commands).toEqual(['clear'])
    expect(w.prompts).toEqual([IDLE_HANDOVER_TEXT, 'Continue from the clear-resume handover that was just loaded.'])
  })

  test('auto: a tool call in flight turns it into a message', auto(), async ($, on) => {
    const { w, clock, hold } = world(on)
    let release!: () => void
    hold(new Promise<void>(r => (release = r)))
    await $.turn.complete(turn)
    const call = $.tool.call({ tool: 'Read', path: '/x' } as never)
    await clock.advance(310 * S)
    expect(w.prompts).toEqual([])
    expect(w.toasts.length).toBe(1)
    release()
    await call
  })

  test('auto with a TTL under 10 minutes behaves as toast', opts('auto', { cache_ttl_minutes: 6 }), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(190 * S)
    expect(w.prompts).toEqual([])
    expect(w.toasts.length).toBe(1)
  })

  test('no fire while a turn is running', opts('toast'), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await $.turn.start({ text: 'go', turnId: 't2' })
    await clock.advance(100 * S)
    expect(w.toasts).toEqual([])
  })

  test('turns are a set of ids: a subagent turn ending does not end the main one', opts('toast'), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await $.turn.start({ text: 'go', turnId: 't2' })
    await $.turn.start({ text: 'sub', turnId: 'sub1' })
    await $.turn.complete({ ...turn, turnId: 'sub1', agentId: 'a1' } as never)
    await clock.advance(100 * S)
    expect(w.toasts).toEqual([])
  })

  test('turns are a set of ids: a subagent turn.start alone is cleared by its own end', opts('toast'), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await $.turn.start({ text: 'sub', turnId: 'sub1' })
    await $.turn.complete({ ...turn, turnId: 'sub1', agentId: 'a1' } as never)
    await clock.advance(70 * S)
    expect(w.toasts.length).toBe(1)
  })

  test('a subagent turn does not count as a reply', opts('toast'), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(50 * S)
    await $.turn.complete({ ...turn, agentId: 'a1' } as never)
    await clock.advance(20 * S)
    expect(w.toasts.length).toBe(1)
  })

  test('an aborted turn does not refresh the reply time', opts('toast'), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(40 * S)
    await $.turn.complete({ ...turn, turnId: 't2', isAborted: true, reason: 'aborted' } as never)
    await clock.advance(30 * S)
    expect(w.toasts.length).toBe(1)
  })

  test('state resets on /clear: the old reply time does not fire in the new session', opts('toast'), async ($, on) => {
    const { w, clock, nextSession } = world(on)
    await $.turn.complete(turn)
    await clock.advance(40 * S)
    await $.session.end(cleared)
    nextSession('s2')
    await clock.advance(40 * S)
    expect(w.toasts).toEqual([])
    // The new session counts from its own first reply.
    await $.turn.complete(turn)
    await clock.advance(70 * S)
    expect(w.toasts.length).toBe(1)
  })

  test('state resets on every session end, not only /clear', opts('toast'), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(40 * S)
    await $.session.end({ ...cleared, reason: 'resume' } as never)
    await clock.advance(40 * S)
    expect(w.toasts).toEqual([])
  })

  test('state resets on a new session start', opts('toast'), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(40 * S)
    await $.session.start(start)
    await clock.advance(40 * S)
    expect(w.toasts).toEqual([])
  })

  test('state resets on compaction', opts('toast'), async ($, on) => {
    const { w, clock } = world(on)
    await $.turn.complete(turn)
    await clock.advance(40 * S)
    await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'x', toolUses: [] }] } as never)
    await clock.advance(40 * S)
    expect(w.toasts).toEqual([])
  })

  test('a session that is not interactive never gets the message', opts('auto'), async ($, on) => {
    const { w, clock } = world(on)
    await $.session.start({ ...start, isInteractive: false })
    await $.turn.complete(turn)
    await clock.advance(310 * S)
    expect(w.toasts).toEqual([])
    expect(w.prompts).toEqual([])
  })

  test('under the headless runner it never fires', auto(), async ($, on) => {
    const { w, clock } = world(on, { CLEAR_RESUME_HEADLESS: '1' })
    await $.turn.complete(turn)
    await clock.advance(310 * S)
    expect(w.toasts).toEqual([])
    expect(w.prompts).toEqual([])
  })

  test('the counting hooks are registered only when idle_handover is on', async ($, on) => {
    const off = world(on)
    const before = off.w.status.length
    await $.turn.start({ text: 'x', turnId: 't1' })
    expect(off.w.status.length).toBe(before)
  })

  test('with idle_handover on, a turn start is seen by the counting hook', opts('toast'), async ($, on) => {
    const { w } = world(on)
    const before = w.status.length
    await $.turn.start({ text: 'x', turnId: 't1' })
    expect(w.status.length).toBe(before + 1)
  })

  test('without $.session.usage it reads the transcript the nudge reads', opts('toast'), async ($, on) => {
    const { w, clock, context, transcripts } = world(on, { CLAUDE_CONFIG_DIR: '/cfg' })
    context(null, 150_000)
    await $.turn.complete(turn)
    await clock.advance(70 * S)
    expect(transcripts[0].split('\\').join('/')).toBe('/cfg/projects/-repo/s1.jsonl')
    expect(w.toasts.length).toBe(1)
  })

  test('with neither usage nor a transcript it stays quiet', opts('toast'), async ($, on) => {
    const { w, clock, context } = world(on)
    context(null)
    await $.turn.complete(turn)
    await clock.advance(100 * S)
    expect(w.toasts).toEqual([])
  })
})
