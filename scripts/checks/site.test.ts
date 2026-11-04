import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pages } from "../../src/pagemap.ts";
import { sidebar } from "../../src/sidebar.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

type Item = { slug: string } | { label: string; items: Item[] };
const flatten = (items: Item[]): string[] =>
  items.flatMap((i) => ("slug" in i ? [i.slug] : flatten(i.items)));

// Needs a built site: run `pnpm build` first.
test("SidebarReachesEveryPage", () => {
  const slugs = flatten(sidebar as Item[]);
  assert.equal(new Set(slugs).size, slugs.length, "a page appears twice in the sidebar");
  assert.deepEqual([...slugs].sort(), pages.map((p) => p.slug).sort());
  assert.equal(pages.length, 49);
  assert.equal(new Set(pages.map((p) => p.key)).size, pages.length, "page keys must be unique");
  for (const p of pages) {
    assert.ok(existsSync(`${root}src/content/docs/${p.slug}.mdx`), `missing stub for ${p.slug}`);
    const built = p.slug === "index" ? "dist/index.html" : `dist/${p.slug}/index.html`;
    assert.ok(existsSync(`${root}${built}`), `${built} is not built`);
  }
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
