import { describe, expect, it } from "vitest";
import { copyLegacySettings } from "../extension/src/legacy-settings.ts";

// Stands in for vscode.workspace.getConfiguration: section -> key -> what inspect() gives.
function fake(values) {
  const writes = [];
  const getConfiguration = (section) => ({
    inspect: (key) => values[section]?.[key],
    update: async (key, value, target) => writes.push([key, value, target]),
  });
  return { getConfiguration, writes };
}

describe("copyLegacySettings", () => {
  it("copies an old setting to the new name at each level it was set", async () => {
    const { getConfiguration, writes } = fake({
      clearResume: { storePath: { globalValue: "D:/store", workspaceValue: "E:/store" } },
    });

    await copyLegacySettings(getConfiguration);

    expect(writes).toEqual([
      ["storePath", "D:/store", 1],
      ["storePath", "E:/store", 2],
    ]);
  });
});
