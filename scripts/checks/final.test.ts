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

const noShots = (aBody: string) => makeRoot(files(aBody));
const missing = (aBody: string) => checkFinal({ root: noShots(aBody), pages }).filter((p) => p.check === "missing-shot");

test("CheckFinalFailsOnMultiLineShot", () => {
  const found = missing('<Shot\n  name="a-one"\n  alt="x"\n/>');
  assert.deepEqual(found.map((p) => p.message), [
    "src/assets/shots/a-one-light.webp does not exist",
    "src/assets/shots/a-one-dark.webp does not exist",
  ]);
  assert.equal(found[0]!.line, 8);
});

test("CheckFinalFailsOnShotWithGreaterThanInAlt", () => {
  assert.equal(missing('<Shot alt="a > b" name="a-one" />').length, 2);
});

test("CheckFinalIgnoresShotInsideCodeFence", () => {
  assert.deepEqual(missing('```mdx\n<Shot name="a-one" alt="x" />\n```'), []);
});

test("CheckFinalFailsOnTodoInScriptsAndWorkflows", () => {
  const root = makeRoot(
    files("Text.", {
      "scripts/tool.ts": "// TODO: replace this\n",
      ".github/workflows/w.yml": "# TODO: replace this\n",
      "scripts/tool.test.ts": "// TODO: tests are skipped\n",
    }),
  );
  const todos = checkFinal({ root, pages }).filter((p) => p.check === "todo");
  assert.deepEqual(todos.map((p) => p.slug).sort(), [".github/workflows/w.yml", "scripts/tool.ts"]);
});

test("CheckFinalAllowsListedSeedStubTodos", () => {
  const root = makeRoot(files("Text.", { "scripts/shots/seed/structure.ts": "// TODO: replace with the real seed\n" }));
  const allowedTodos = [{ file: "scripts/shots/seed/structure.ts", contains: "replace with the real seed" }];
  assert.deepEqual(checkFinal({ root, pages, allowedTodos }).filter((p) => p.check === "todo"), []);
  assert.equal(checkFinal({ root, pages }).filter((p) => p.check === "todo").length, 1);
});
