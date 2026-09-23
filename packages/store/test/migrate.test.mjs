import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveRecord, listAll, setPinned } from "../store.mjs";
import { migrate } from "../migrate.mjs";

let tmp, notes, handoffs, root;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cr-mig-"));
  notes = join(tmp, "Notes", "resume");
  handoffs = join(tmp, "handoffs");
  root = join(tmp, "store");
  mkdirSync(notes, { recursive: true });
  mkdirSync(handoffs, { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writePair({ file, body = "# full handover\n\nthe long version", prompt }) {
  const md = join(handoffs, "acme-2026-09-19-thing.md");
  writeFileSync(md, body, "utf8");
  writeFileSync(join(notes, file), prompt ?? `do the thing (acme): Resume from handover: ${md}\n\nmore`, "utf8");
  return md;
}

describe("migrate", () => {
  it("pairs a resume prompt with the handover body it names", () => {
    const md = writePair({ file: "Acme 09-19 2308 Do the thing.txt" });
    const report = migrate({ notesDir: notes, root });

    expect(report.imported).toBe(1);
    const [r] = listAll(root);
    expect(r.title).toBe("Do the thing");
    expect(r.repo).toBe("acme");
    expect(r.body).toBe("# full handover\n\nthe long version");
    expect(r.resumePrompt).toContain(`Resume from handover: ${md}`);
    expect(r.source).toBe("notes-resume");
    expect(r.status).toBe("waiting");
  });

  it("re-running never overwrites a record the user has since changed, and leaves the originals on disk", () => {
    const md = writePair({ file: "Acme 09-19 2308 Do the thing.txt" });
    migrate({ notesDir: notes, root });
    const [first] = listAll(root);
    archiveRecord(first.id, { root });
    setPinned(first.id, true, { root });

    const second = migrate({ notesDir: notes, root });

    expect(second.imported).toBe(0);
    expect(second.alreadyPresent).toBe(1);
    const all = listAll(root);
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("archived");
    expect(all[0].pinned).toBe(true);
    expect(existsSync(md)).toBe(true);
    expect(existsSync(join(notes, "Acme 09-19 2308 Do the thing.txt"))).toBe(true);
    expect(readFileSync(md, "utf8")).toBe("# full handover\n\nthe long version");
  });

  it("keeps two handovers written in the same minute with no index row", () => {
    writeFileSync(join(notes, "Acme 09-19 2308 First.txt"), "first prompt", "utf8");
    writeFileSync(join(notes, "Acme 09-19 2308 Second.txt"), "second prompt", "utf8");

    const report = migrate({ notesDir: notes, root });

    expect(report.imported).toBe(2);
    expect(listAll(root).map((r) => r.title).sort()).toEqual(["First", "Second"]);
  });

  it("imports the archive/ subfolder and marks those records archived", () => {
    mkdirSync(join(notes, "archive"), { recursive: true });
    writeFileSync(join(notes, "Acme 09-19 2308 Waiting one.txt"), "waiting prompt", "utf8");
    writeFileSync(join(notes, "archive", "Acme 09-01 0900 Old one.txt"), "old prompt", "utf8");

    const report = migrate({ notesDir: notes, root });

    expect(report.imported).toBe(2);
    const byTitle = Object.fromEntries(listAll(root).map((r) => [r.title, r]));
    expect(byTitle["Waiting one"].status).toBe("waiting");
    expect(byTitle["Old one"].status).toBe("archived");
    expect(byTitle["Old one"].archivedAt).toBeTruthy();
  });
});
