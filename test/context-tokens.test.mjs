// plugin/scripts/context-tokens.mjs: the transcript reading the relay mod runs for
// the idle handover when the host gives no usage figure. It must agree with the
// Stop-hook nudge, which uses the same function (lib/nudge.mjs).
// tdd-guard:allow - backfilled onto a thin wrapper over lastContextTokens.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { lastContextTokens } from "../plugin/scripts/lib/nudge.mjs";

const SCRIPT = join(import.meta.dirname, "../plugin/scripts/context-tokens.mjs");
const dir = mkdtempSync(join(tmpdir(), "context-tokens-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const call = (usage, extra = {}) =>
  JSON.stringify({ type: "assistant", message: { usage }, ...extra });
const run = (file) => spawnSync(process.execPath, [SCRIPT, file], { encoding: "utf8" });

describe("context-tokens.mjs", () => {
  it("prints the last main-thread call's input and cache tokens", () => {
    const file = join(dir, "a.jsonl");
    writeFileSync(
      file,
      [
        call({ input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3 }),
        call({ input_tokens: 10, cache_creation_input_tokens: 20_000, cache_read_input_tokens: 130_000 }),
        call({ input_tokens: 999_999 }, { isSidechain: true }),
      ].join("\n") + "\n",
    );
    const r = run(file);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("150010");
    expect(Number(r.stdout)).toBe(lastContextTokens(file));
  });

  it("exits 1 with no output when there is no assistant call, or no file", () => {
    const file = join(dir, "b.jsonl");
    writeFileSync(file, JSON.stringify({ type: "user" }) + "\n");
    for (const f of [file, join(dir, "missing.jsonl")]) {
      const r = run(f);
      expect(r.status).toBe(1);
      expect(r.stdout).toBe("");
    }
  });
});
