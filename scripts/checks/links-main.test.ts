import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { checkPage } from "./page.ts";
import { parseGithubRef } from "./links-main.ts";
import { checkRepoDocs } from "./slop.ts";
import { makeRoot, page, pageA } from "./fixture.ts";

const run = (body: string) => {
  const root = makeRoot({ "src/content/docs/a.mdx": page("Page A", 1, body), "examples/caddy/Caddyfile": "x\n" });
  execFileSync("git", ["-C", root, "init", "-q"]);
  execFileSync("git", ["-C", root, "add", "."]);
  return checkPage("a", { root, pages: [pageA] }, (c) => c.name === "links-main").map((p) => p.message);
};

const docs = "https://github.com/codexsuite/docs";

test("LinkCheckFailsOnBranchLink", () => {
  const messages = run(
    [
      `[branch](${docs}/blob/feat/cdx-1-docs-site/examples/caddy/Caddyfile)`,
      `[sha](${docs}/blob/0123abc/examples/caddy/Caddyfile)`,
      `[tree](${docs}/tree/wip/x)`,
      `[raw](https://raw.githubusercontent.com/codexsuite/codex/dev/README.md)`,
      `[tag](https://github.com/codexsuite/codex/releases/tag/v1)`,
      "```text",
      `curl ${docs}/raw/feature/x/a.yml`,
      "```",
    ].join("\n"),
  );
  assert.equal(messages.length, 6, messages.join("\n"));
  assert.match(messages[0]!, /points at "feat"/);
});

test("LinkCheckChecksMainPathsAgainstTrackedFiles", () => {
  const messages = run(
    [
      `[ok](${docs}/blob/main/examples/caddy/Caddyfile#L3)`,
      `[ok raw](${docs}/raw/main/examples/caddy/Caddyfile)`,
      `[ok dir](${docs}/tree/main/examples/caddy)`,
      `[missing](${docs}/blob/main/examples/quickstart/docker-compose.yml)`,
      `[no refs](${docs}/pull/1) [issues](https://github.com/codexsuite/codex/issues/3)`,
      "[product](https://github.com/codexsuite/codex/blob/main/README.md).",
    ].join("\n"),
  );
  assert.equal(messages.length, 1, messages.join("\n"));
  assert.match(messages[0]!, /does not track "examples\/quickstart\/docker-compose.yml"/);
});

test("LinkCheckParsesRefs", () => {
  assert.deepEqual(parseGithubRef("https://github.com/a/b/blob/main/x/y.md?plain=1#L2"), { repo: "a/b", kind: "blob", ref: "main", path: "x/y.md" });
  assert.equal(parseGithubRef("https://github.com/a/b/pull/4"), null);
});

test("LinkCheckFailsOnBranchLinkInRepoDocuments", () => {
  const root = makeRoot({
    "README.md": `[x](${docs}/blob/feat/x/README.md)\n`,
    "AGENTS.md": "[y](https://github.com/codexsuite/codex/blob/dev/README.md)\n",
    "docs/notes.md": `[ok](https://github.com/codexsuite/codex/blob/main/README.md)\n`,
  });
  const problems = checkRepoDocs(root).filter((p) => p.check === "links-main");
  assert.deepEqual(problems.map((p) => p.slug).sort(), ["AGENTS.md", "README.md"]);
});
