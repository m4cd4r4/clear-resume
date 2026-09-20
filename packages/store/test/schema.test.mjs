// tdd-guard:allow - backfill onto schema.mjs, which was written first as the shared
// contract between plugin and extension. The modules that follow go test-first.
import { describe, expect, it } from "vitest";
import {
  ageDays,
  fileName,
  isExpired,
  isStale,
  normalise,
  normalisePath,
  parseId,
  recordId,
  SCHEMA_VERSION,
} from "../schema.mjs";

const BASE = {
  title: "clear-resume extension phase 1",
  body: "# handover\n\nbody text",
  repoPath: "I:/Scratch/clear-resume",
  machine: "HARD-WORKER",
  pid: 26096,
  createdAt: "2026-09-19T23:28:51.277Z",
};

describe("recordId", () => {
  it("is machine-pid-timestamp with colons stripped", () => {
    expect(recordId(BASE)).toBe("hard-worker-26096-2026-09-19T23-28-51Z");
  });

  it("round-trips through parseId", () => {
    expect(parseId(recordId(BASE))).toEqual({
      machine: "hard-worker",
      pid: "26096",
      stamp: "2026-09-19T23-28-51Z",
    });
  });

  it("gives two machines different filenames for the same instant", () => {
    const a = fileName(normalise({ ...BASE, machine: "desk" }));
    const b = fileName(normalise({ ...BASE, machine: "laptop" }));
    expect(a).not.toBe(b);
  });
});

describe("normalisePath", () => {
  it("folds windows separators and drive-letter casing", () => {
    expect(normalisePath("i:\\Scratch\\clear-resume\\")).toBe("I:/Scratch/clear-resume");
    expect(normalisePath("I:/Scratch/clear-resume")).toBe("I:/Scratch/clear-resume");
  });
});

describe("normalise", () => {
  it("fills defaults", () => {
    const r = normalise(BASE);
    expect(r.schema).toBe(SCHEMA_VERSION);
    expect(r.status).toBe("waiting");
    expect(r.pinned).toBe(false);
    expect(r.repo).toBe("clear-resume");
    expect(r.branch).toBe("");
    expect(r.source).toBe("native");
  });

  it("falls back to the body when there is no resume prompt", () => {
    expect(normalise(BASE).resumePrompt).toBe("# handover\n\nbody text");
    expect(normalise({ ...BASE, resumePrompt: "go" }).resumePrompt).toBe("go");
  });

  it("rejects a record missing what makes it useful", () => {
    expect(() => normalise({ ...BASE, title: "  " })).toThrow(/title/);
    expect(() => normalise({ ...BASE, body: "" })).toThrow(/body/);
    expect(() => normalise({ ...BASE, repoPath: "" })).toThrow(/repoPath/);
  });

  it("coerces an unknown status rather than throwing", () => {
    expect(normalise({ ...BASE, status: "banana" }).status).toBe("waiting");
  });
});

describe("timers", () => {
  const day = (n) => new Date(Date.parse(BASE.createdAt) + n * 86400000);

  it("measures age in days", () => {
    expect(ageDays(normalise(BASE), day(3))).toBeCloseTo(3, 5);
  });

  it("drops waiting to stale after 7 days", () => {
    const r = normalise(BASE);
    expect(isStale(r, day(6))).toBe(false);
    expect(isStale(r, day(8))).toBe(true);
  });

  it("expires archived after 30 days from archivedAt", () => {
    const r = normalise({ ...BASE, status: "archived", archivedAt: BASE.createdAt });
    expect(isExpired(r, day(29))).toBe(false);
    expect(isExpired(r, day(31))).toBe(true);
  });

  it("never expires or stales a pinned record", () => {
    const stale = normalise({ ...BASE, pinned: true });
    const old = normalise({ ...BASE, pinned: true, status: "archived", archivedAt: BASE.createdAt });
    expect(isStale(stale, day(400))).toBe(false);
    expect(isExpired(old, day(400))).toBe(false);
  });

  it("does not expire a waiting record, however old", () => {
    expect(isExpired(normalise(BASE), day(400))).toBe(false);
  });
});
