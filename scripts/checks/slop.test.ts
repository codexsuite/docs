import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPage } from "./page.ts";
import { checkRepoDocs, scanProse, titleCaseWords } from "./slop.ts";
import { makeRoot, page, pageA } from "./fixture.ts";

const slopMessages = (body: string) =>
  checkPage("a", { root: makeRoot({ "src/content/docs/a.mdx": page("Page A", 1, body) }), pages: [pageA] }, (c) => c.name === "slop").map(
    (p) => p.message,
  );

// One fixture per mechanical rule. Each must fail on its own rule and nothing else.
const fixtures: [number, string][] = [
  [3, "The editor saves your text, ensuring nothing is lost."],
  [7, "This is a pivotal step."],
  [8, "The page serves as the home screen."],
  [9, "It is not just a editor, but a library."],
  [13, "Save the file — then close it."],
  [13, "Pages 3–5 cover it."],
  [13, "Save the file - then close it."],
  [17, "## Export A Print Ready Book"],
  [18, "Press save 🚀 to continue."],
  [19, "Press “save” to continue."],
  [23, "Open the menu in order to save."],
  [26, "The API surface is small."],
  [26, "Each step is a wedge into the next."],
  [31, "You can leverage the shortcut."],
];

test("SlopCheckFailsOnEachMechanicalRule", () => {
  for (const [rule, text] of fixtures) {
    const messages = slopMessages(text);
    assert.ok(messages.length > 0, `no problem for rule ${rule}: ${text}`);
    assert.ok(
      messages.every((m) => m.startsWith(`rule ${rule}:`)),
      `rule ${rule} fixture gave ${JSON.stringify(messages)}`,
    );
  }
  assert.deepEqual([...new Set(fixtures.map(([r]) => r))].sort((a, b) => a - b), [3, 7, 8, 9, 13, 17, 18, 19, 23, 26, 31]);
});

test("SlopCheckIgnoresCodeBlocks", () => {
  const bad = "This is a pivotal step — “quoted”, ensuring";
  const body = [
    "```text",
    bad,
    "```",
    "~~~",
    bad,
    "~~~",
    `Inline \`${bad}\` is code.`,
    "import Pivotal from '../crucial/leverage.astro';",
    "export const delve = 1;",
    "{/* generated */}",
    "| Tool | Does |",
    `| a | ${bad} |`,
    "{/* generated */}",
    "[link](https://example.com/—/crucial) and https://example.com/tapestry end.",
    "## Set up the Fresnel lens in Docker Compose",
  ].join("\n");
  assert.deepEqual(slopMessages(body), []);
  // The frontmatter key is not prose, its value is.
  const root = makeRoot({ "src/content/docs/a.mdx": '---\ntitle: "Page A"\ndescription: "A pivotal page."\nsidebar:\n  order: 1\n---\n\nText.\n' });
  const messages = checkPage("a", { root, pages: [pageA] }, (c) => c.name === "slop").map((p) => p.message);
  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /rule 7/);
});

test("SlopCheckReportsLineNumbers", () => {
  const root = makeRoot({ "src/content/docs/a.mdx": page("Page A", 1, "Fine.\n\nThis is crucial.") });
  const [p] = checkPage("a", { root, pages: [pageA] }, (c) => c.name === "slop");
  assert.equal(p!.line, 10);
});

test("SlopCheckAcceptsSentenceCaseHeadings", () => {
  assert.deepEqual(titleCaseWords("Export a print-ready PDF with the Fresnel lens"), []);
  assert.deepEqual(titleCaseWords("Quick start: Docker Compose"), []);
  assert.deepEqual(titleCaseWords("Export A Book"), ["Book"]);
  assert.deepEqual(scanProse("# Title\n\n## Plain heading\n"), []);
});

test("SlopCheckReadsRepoDocumentsButNotTheUnslopCopy", () => {
  const root = makeRoot({
    "README.md": "# Docs\n\nThis is crucial.\n",
    "AGENTS.md": "# Agents\n\nFine.\n",
    "docs/notes.md": "# Notes\n\nIn order to start.\n",
    "docs/unslop.md": "pivotal — text\n",
  });
  const problems = checkRepoDocs(root);
  assert.deepEqual(
    problems.map((p) => `${p.check}:${p.slug}`).sort(),
    ["slop:README.md", "slop:docs/notes.md", "unslop-copy:docs/unslop.md"],
  );
});

test("UnslopCopyMatchesHash", () => {
  const problems = checkRepoDocs(new URL("../../", import.meta.url).pathname.replace(/\/$/, "")).filter((p) => p.check === "unslop-copy");
  assert.deepEqual(problems, []);
  const edited = makeRoot({ "docs/unslop.md": "# Unslop\n\nedited\n" });
  assert.match(checkRepoDocs(edited)[0]!.message, /not the recorded/);
});

test("SlopCheckFailsOnAnUnpairedGeneratedMarker", () => {
  const found = scanProse("{/* generated */}\n\nThis is crucial.\n");
  assert.equal(found.length, 2, JSON.stringify(found));
  assert.ok(found.some((f) => /generated/.test(f.message)));
  assert.ok(found.some((f) => /rule 7/.test(f.message)));
});

test("SlopCheckExemptsOnlyTableRowsBetweenGeneratedMarkers", () => {
  const found = scanProse(
    ["{/* generated */}", "This is crucial.", "| a | pivotal |", "{/* generated */}", "", "This is crucial."].join("\n"),
  );
  assert.deepEqual(
    found.map((f) => f.line),
    [2, 6],
  );
});
