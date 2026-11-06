import { expect, it } from "vitest";
import { gitSlack } from "../../plugin/packages/store/git-slack.mjs";

// Unset or nonsense keeps every product git limit as written; only a test run widens them.
it("scales only from a whole number above 1, capped at 10", () => {
  const at = (v) => gitSlack(v === undefined ? {} : { CORNERMAN_TEST_GIT_SLACK: v });
  expect([undefined, "", "0", "1", "-3", "x", "2.5"].map(at)).toEqual([1, 1, 1, 1, 1, 1, 2]);
  expect([at("4"), at("99")]).toEqual([4, 10]);
});
