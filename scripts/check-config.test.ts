import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(repoRoot, "scripts/check-config.ts");
const page = join(repoRoot, "src/content/docs/start/configuration.mdx");
// A copy of the product README's Configuration section. Set CODEX_PRODUCT_README to test the real README instead.
const readme = process.env.CODEX_PRODUCT_README ?? join(repoRoot, "scripts/fixtures/product-readme-config.md");

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "check-config-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(readmePath: string, pagePath?: string) {
  const r = spawnSync("pnpm", ["exec", "tsx", script, readmePath, ...(pagePath ? [pagePath] : [])], { cwd: repoRoot, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test("ConfigCheckPassesAgainstProductTable", () => {
  const r = run(readme);
  assert.equal(r.status, 0, r.out);
});

test("ConfigCheckFailsOnMissingVariable", () => {
  const withExtraRow = `${readFileSync(readme, "utf8").trimEnd()}\n| \`CODEX_NEW_THING\` | Print | A new setting. | None |\n`;
  const file = join(dir, "README.md");
  writeFileSync(file, withExtraRow);
  const r = run(file);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /CODEX_NEW_THING is in the README table .* but not on the page/);
});

test("ConfigCheckFailsOnExtraVariable", () => {
  const without = readFileSync(readme, "utf8").split("\n").filter((l) => !l.startsWith("| `CODEX_SEQ_API_KEY`")).join("\n");
  const file = join(dir, "README.md");
  writeFileSync(file, without);
  const r = run(file);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /CODEX_SEQ_API_KEY is on the page .* but not in the README table/);
});

test("ConfigCheckFailsOnWrongGroup", () => {
  const moved = readFileSync(readme, "utf8").replace("| `CODEX_ROLE` | Worker |", "| `CODEX_ROLE` | Print |");
  const file = join(dir, "README.md");
  writeFileSync(file, moved);
  const r = run(file);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /CODEX_ROLE is in group "Print"/);
});

test("ConfigCheckRejectsReadmeWithoutTable", () => {
  const file = join(dir, "README.md");
  writeFileSync(file, "# Nothing here\n");
  const r = run(file, page);
  assert.equal(r.status, 2, r.out);
});
