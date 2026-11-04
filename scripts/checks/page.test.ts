import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPage } from "./page.ts";
import { makeRoot, page, pageA, pageB } from "./fixture.ts";

const pages = [pageA, pageB];
const run = (files: Record<string, string>, id = "a") => checkPage(id, { root: makeRoot(files), pages });

test("CheckPageFailsOnBrokenLink", () => {
  const body = [
    "[ok](/sub/b/)",
    "[missing](/nowhere/) [no slash](/sub/b) [relative](other/) [file](/brand/none.svg)",
    "```",
    "[in code](/ignored/)",
    "```",
    'and <a href="/gone/">html</a>',
  ].join("\n");
  const problems = run({ "src/content/docs/a.mdx": page("Page A", 1, body) });
  const messages = problems.map((p) => p.message).join("\n");
  assert.match(messages, /"\/nowhere\/" is not a page/);
  assert.match(messages, /"\/sub\/b" has no trailing slash/);
  assert.match(messages, /"other\/" is relative/);
  assert.match(messages, /"\/brand\/none.svg" is not a file/);
  assert.match(messages, /"\/gone\/" is not a page/);
  assert.doesNotMatch(messages, /ignored/);
  assert.equal(problems.length, 5);
  assert.equal(problems[0]!.line, 9);
});

test("CheckPagePassesOnGoodLinks", () => {
  const files = {
    "src/content/docs/a.mdx": page("Page A", 1, "[b](/sub/b/#x) [site](https://example.com/x) [mail](mailto:a@b.c)"),
  };
  assert.deepEqual(run(files), []);
});

test("CheckPageFailsOnBadFrontmatter", () => {
  const cases: [string, string, RegExp][] = [
    ["wrong title", page("Other", 1, "x"), /title is "Other"/],
    ["wrong order", page("Page A", 7, "x"), /sidebar.order is "7"/],
    ["no description", page("Page A", 1, "x", ""), /description is missing/],
    ["no frontmatter", "just text\n", /does not start with frontmatter/],
  ];
  for (const [name, text, expected] of cases) {
    const problems = run({ "src/content/docs/a.mdx": text });
    assert.ok(problems.some((p) => p.check === "frontmatter" && expected.test(p.message)), name);
  }
});

test("CheckPageFailsOnStubMarker", () => {
  const problems = run({ "src/content/docs/a.mdx": page("Page A", 1, "{/* STUB */}") });
  assert.deepEqual(problems.map((p) => p.check), ["stub-marker"]);
  assert.equal(problems[0]!.line, 8);
});

test("CheckPageRejectsUnknownPage", () => {
  assert.match(run({}, "nope")[0]!.message, /not a page in the page map/);
});
