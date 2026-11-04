import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFinal } from "./final.ts";
import { makeRoot, page, pageA, pageB } from "./fixture.ts";

const pages = [pageA, pageB];
const files = (aBody: string, extra: Record<string, string> = {}) => ({
  "src/content/docs/a.mdx": page("Page A", 1, aBody),
  "src/content/docs/sub/b.mdx": page("Page B", 2, "Text."),
  ...extra,
});

test("CheckFinalFailsOnMissingShot", () => {
  const root = makeRoot(files('<Shot name="a-one" alt="x" />', { "src/assets/shots/a-one-light.webp": "x" }));
  const problems = checkFinal({ root, pages });
  assert.deepEqual(
    problems.map((p) => [p.check, p.message]),
    [["missing-shot", "src/assets/shots/a-one-dark.webp does not exist"]],
  );
});

test("CheckFinalFailsOnStubAndUnlistedTodo", () => {
  const root = makeRoot(files("{/* STUB */}\nTODO write this"));
  assert.deepEqual(checkFinal({ root, pages }).map((p) => p.check).sort(), ["stub-marker", "todo"]);
});

test("CheckFinalPassesOnFinishedSite", () => {
  const root = makeRoot(
    files('<Shot name="a-one" alt="x" />', {
      "src/assets/shots/a-one-light.webp": "x",
      "src/assets/shots/a-one-dark.webp": "x",
    }),
  );
  assert.deepEqual(checkFinal({ root, pages }), []);
});
