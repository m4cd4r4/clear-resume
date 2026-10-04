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

const SAVE = 'node "C:/Users/me/.claude/plugins/cache/clear-resume/scripts/save.mjs" --title "x" <<\'EOF\''
const SAVED = 'Saved handover "x" (id abc123).'

type World = { commands: string[]; prompts: string[]; toasts: string[]; status: (string | undefined)[]; registered: string[] }

function world(on: On, env: Record<string, string> = {}) {
  const w: World = { commands: [], prompts: [], toasts: [], status: [], registered: [] }
  const clock = mock.clock(on)
  mock.env(on, env)
  let out = SAVED
  let isError = false
  // git rev-parse HEAD: a fixed commit unless a test moves it; null stands for no git.
  let head: string | null = 'c0'
  on('process.run', async () => ({
    value:
      head === null
        ? { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }
        : { exitCode: 0, stdout: `${head}\n`, stderr: '' },
  }))
  on('tool.call', { tool: 'Bash' }, async () =>
    isError
      ? { result: { stdout: '', stderr: out, interrupted: false }, text: out, isError: true }
      : { result: { stdout: out, stderr: '', interrupted: false }, text: out },
  )
  on('turn.complete', async ($, e) => ({ text: e.answer }))
  on('session.end', async ($, e) => ({ sessionId: e.sessionId }))
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('command.run', async ($, e) => {
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
})
