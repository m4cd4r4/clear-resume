import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveRecord, save } from "../../plugin/packages/store/store.mjs";

const SCRIPT = fileURLToPath(new URL("../../plugin/scripts/idle-cleared.mjs", import.meta.url));

describe("idle-cleared.mjs", () => {
  let root;
  const ask = (id) => JSON.parse(execFileSync("node", [SCRIPT, id], { env: { ...process.env, CLEAR_RESUME_HOME: root }, encoding: "utf8" }));
  const write = (over, now = new Date("2026-10-30T10:00:00Z")) =>
    save(
      {
        title: "Ship it",
        repo: "acme",
        repoPath: "/work/acme",
        body: "# Ship it\n\n## Goal\nShip.\n\n## Next action\nRun the tests.\nThen push.\n\n## State\nGreen.",
        machine: "box",
        pid: "1",
        sessionId: "s1",
        ...over,
      },
      { root, now },
    );

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "idle-cleared-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("reports a waiting handover with its next action's first line", () => {
    write();
    expect(ask("s1")).toEqual({ status: "waiting", title: "Ship it", repo: "acme", next: "Run the tests." });
  });

  it("picks the session's latest save, loaded or not, and never another session's", () => {
    archiveRecord(write({ title: "Old" }, new Date("2026-10-30T09:00:00Z")).id, { root });
    archiveRecord(write({ title: "New" }, new Date("2026-10-30T10:00:00Z")).id, { root });
    write({ title: "Other", sessionId: "s2" }, new Date("2026-10-30T11:00:00Z"));
    expect(ask("s1")).toMatchObject({ status: "archived", title: "New" });
  });
});
