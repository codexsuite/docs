import { test } from "node:test";
import assert from "node:assert/strict";
import { maskText, textHash } from "./compare.ts";

test("SameStateIgnoresTimeLabels", () => {
  const light = "Tide Tables\nEdited 1m ago\nSalt and Signal\n2h ago\nCreated 2026-01-15 14:02 UTC, opened at 14:02\nYesterday, 30 Sep, 2 Mar 2025";
  const dark = "Tide Tables\nEdited 2m ago\nSalt and Signal\njust now\nCreated 2026-01-15 14:03 UTC, opened at 14:03\n3 Feb, 11h ago, 5 Dec 2024";
  assert.equal(textHash(light), textHash(dark));
  assert.equal(maskText("Edited 12m ago"), maskText("Edited just now"));
});

test("SameStateIgnoresHiddenSecrets", () => {
  assert.equal(textHash("Copy this token: cdx_abc123XYZ now", ["cdx_abc123XYZ"]), textHash("Copy this token: cdx_def456QRS now", ["cdx_def456QRS"]));
  assert.equal(textHash("Password kT4mQ8vN2xB7cD5f", ["kT4mQ8vN2xB7cD5f"]), textHash("Password hG6jR3wP9sL2aZ8e", ["hG6jR3wP9sL2aZ8e"]));
});

test("SameStateStillFailsOnARealDifference", () => {
  assert.notEqual(textHash("Books\nSalt and Signal\nEdited 1m ago", []), textHash("Books\nEdited 1m ago", []));
  assert.notEqual(textHash("Chapter 1", []), textHash("Chapter 2", []));
  assert.notEqual(textHash("Token cdx_abc", []), textHash("Token cdx_abc extra", ["cdx_abc"]));
});
