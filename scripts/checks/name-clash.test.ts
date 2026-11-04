import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sentence =
  "Codex at codexsuite.app is an independent, open-source writing studio for authors. It is not affiliated with OpenAI or its Codex coding agent.";

// Needs a built site: run `pnpm build` first.
test("NameClashNoteOnHomeAndOverview", () => {
  for (const file of ["dist/index.html", "dist/start/overview/index.html"]) {
    assert.ok(existsSync(`${root}${file}`), `${file} is missing: run pnpm build first`);
    const text = readFileSync(`${root}${file}`, "utf8").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
    assert.ok(text.includes(sentence), `${file} lacks the Not that Codex sentence`);
  }
});
