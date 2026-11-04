import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const page = readFileSync(`${root}/src/content/docs/start/quickstart.mdx`, "utf8");

test("QuickStartPageMatchesExampleFiles", () => {
  for (const file of ["docker-compose.yml", ".env.example"]) {
    const escaped = file.replace(/\./g, "\\.");
    assert.match(
      page,
      new RegExp(`^import \\w+ from "[./]*/examples/quickstart/${escaped}\\?raw";$`, "m"),
      `the page imports examples/quickstart/${file} with ?raw`,
    );
    readFileSync(`${root}/examples/quickstart/${file}`, "utf8");
  }
  assert.match(page, /<Code code=\{compose\}/, "the page shows the Compose file from its import");
  assert.match(page, /<Code code=\{envExample\}/, "the page shows the env file from its import");
  assert.doesNotMatch(page, /^\s*image: /m, "the page does not paste Compose lines by hand");
});
