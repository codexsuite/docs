import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const page = readFileSync(`${root}/src/content/docs/start/production.mdx`, "utf8");

/** The text of the "What to back up" section, up to the next ## heading. */
function backupSection(source: string): string {
  const start = source.indexOf("## What to back up");
  assert.notEqual(start, -1, "the page has a What to back up section");
  const rest = source.slice(start + 1);
  const next = rest.search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next);
}

test("BackupListNamesAllThreeStores", () => {
  const section = backupSection(page);
  assert.match(section, /Postgres/, "names the database");
  assert.match(section, /CODEX_BLOB_ROOT/, "names the blob folder");
  assert.match(section, /CODEX_DATA_PROTECTION_DIR/, "names the key ring folder");
  assert.match(section, /key ring/i);
});

test("the page documents the saved-key error", () => {
  assert.match(page, /`not_configured`/);
  assert.match(page, /Settings → AI|Settings, then AI/);
});
