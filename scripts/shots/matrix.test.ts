import { test } from "node:test";
import assert from "node:assert/strict";
import { selectLegs } from "./matrix.ts";

test("MatrixTakesPageMapKeysWithASpecAndNamesTheRest", () => {
  const legs = selectLegs(["ui-library", "ui-write", "ui-plan"], ["ui-write", "ui-library", "_throws", "_smoke"]);
  assert.deepEqual(legs.page, ["ui-library", "ui-write"]);
  assert.deepEqual(legs.skipped, ["ui-plan"]);
});
