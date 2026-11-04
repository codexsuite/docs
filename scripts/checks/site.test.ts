import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pages, pagePath } from "../../src/pagemap.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

// Needs a built site: run `pnpm build` first.
test("SidebarReachesEveryPage", () => {
  assert.equal(pages.length, 49);
  assert.equal(new Set(pages.map((p) => p.key)).size, pages.length, "page keys must be unique");
  const home = `${root}dist/index.html`;
  assert.ok(existsSync(home), "dist/index.html is missing: run pnpm build first");
  const html = readFileSync(home, "utf8");
  const nav = html.match(/<nav[^>]*aria-label="Main"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(nav, "the built home page has no Main navigation");
  const links = [...nav[1].matchAll(/<a\s[^>]*href="(\/[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(links, pages.map(pagePath));
});

test("BuildFailsOnBrokenInternalLink", () => {
  const file = `${root}src/content/docs/zz-broken-link-test.mdx`;
  writeFileSync(
    file,
    '---\ntitle: Broken\n---\n\n[nowhere](/does-not-exist/)\n',
  );
  try {
    const r = spawnSync("pnpm", ["exec", "astro", "build", "--outDir", "dist-broken-test"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.notEqual(r.status, 0, "build should fail on a broken internal link");
    assert.match(r.stdout + r.stderr, /does-not-exist/);
  } finally {
    rmSync(file, { force: true });
    rmSync(`${root}dist-broken-test`, { recursive: true, force: true });
  }
});
