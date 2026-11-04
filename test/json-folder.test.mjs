// JsonFolder holds a folder of JSON files in memory and rereads only what the store
// watcher names. A change the watcher reports but the folder drops is a sidebar that
// never updates, so the path the watcher hands over is matched as VS Code spells it.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFolder } from "../extension/src/json-folder.ts";

let dir;
beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "cm-folder-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const folder = () => new JsonFolder(() => dir, (n) => n.endsWith(".json"), (json) => json);

describe("JsonFolder", () => {
  it.runIf(process.platform === "win32")("takes a change the watcher reports with a lower-case drive letter", async () => {
    writeFileSync(join(dir, "a.json"), JSON.stringify({ n: 1 }));
    const f = folder();
    await f.update();
    writeFileSync(join(dir, "a.json"), JSON.stringify({ n: 22 }));
    // Uri.fsPath on Windows: "c:\\Users\\..." whatever the folder's own spelling.
    f.changed(join(dir, "a.json").replace(/^[A-Z]:/, (d) => d.toLowerCase()));
    expect(await f.update()).toBe(true);
    expect(f.values()).toEqual([{ n: 22 }]);
  });
});
