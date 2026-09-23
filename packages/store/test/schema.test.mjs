// tdd-guard:allow - backfill onto schema.mjs, which was written first as the shared
// contract between plugin and extension. The modules that follow go test-first.
import { describe, expect, it } from "vitest";
import {
  ageDays,
  fileName,
  isExpired,
  isPurgeable,
  isTombstone,
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
  machine: "WORKSTATION",
  pid: 26096,
  createdAt: "2026-09-19T23:28:51.277Z",
};

describe("recordId", () => {
  it("is machine-pid-timestamp with colons stripped, milliseconds kept", () => {
    expect(recordId(BASE)).toBe("workstation-26096-2026-09-19T23-28-51-277Z");
  });

  it("round-trips through parseId", () => {
    expect(parseId(recordId(BASE))).toEqual({
      machine: "workstation",
      pid: "26096",
      stamp: "2026-09-19T23-28-51-277Z",
    });
  });

  // The first 500-odd records were written before the stamp carried
  // milliseconds. Their ids are still their filenames, so they have to parse.
  it("still parses a second-resolution id written by an older version", () => {
    expect(parseId("workstation-26096-2026-09-19T23-28-51Z")).toEqual({
      machine: "workstation",
      pid: "26096",
      stamp: "2026-09-19T23-28-51Z",
    });
  });

  it("separates two handovers written in the same second", () => {
    const a = recordId({ ...BASE, createdAt: "2026-09-19T23:28:51.100Z" });
    const b = recordId({ ...BASE, createdAt: "2026-09-19T23:28:51.900Z" });
    expect(a).not.toBe(b);
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

  it("lets a tombstone have no body, because that is the point of one", () => {
    const r = normalise({ ...BASE, status: "deleted", body: "" });
    expect(r.status).toBe("deleted");
    expect(r.body).toBe("");
    expect(isTombstone(r)).toBe(true);
    expect(() => normalise({ ...BASE, status: "deleted", title: " " })).toThrow(/title/);
  });

  it("stamps updatedAt, falling back to the last thing that happened", () => {
    expect(normalise(BASE).updatedAt).toBe(BASE.createdAt);
    const at = "2026-09-25T00:00:00.000Z";
    expect(normalise({ ...BASE, status: "archived", archivedAt: at }).updatedAt).toBe(at);
    expect(normalise({ ...BASE, updatedAt: at }).updatedAt).toBe(at);
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

  it("purges a tombstone after 90 days from deletedAt, never a pinned one", () => {
    const r = normalise({ ...BASE, body: "", status: "deleted", deletedAt: BASE.createdAt });
    expect(isPurgeable(r, day(89))).toBe(false);
    expect(isPurgeable(r, day(91))).toBe(true);
    expect(isPurgeable({ ...r, pinned: true }, day(400))).toBe(false);
    expect(isPurgeable(normalise(BASE), day(400))).toBe(false);
  });
});
