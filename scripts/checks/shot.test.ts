import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Builds a throwaway page that uses <Shot> and reads the built HTML. Run after `pnpm build` is not needed.
const root = fileURLToPath(new URL("../../", import.meta.url));
const pageFile = `${root}src/content/docs/zz-shot-test.mdx`;
const out = `${root}dist-shot-test`;
const shots = ["zz-shot-test-here-light.webp", "zz-shot-test-here-dark.webp"].map((n) => `${root}src/assets/shots/${n}`);
let html = "";
let log = "";

before(async () => {
  const png = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#456" } }).webp().toBuffer();
  for (const f of shots) writeFileSync(f, png);
  writeFileSync(
    pageFile,
    [
      "---",
      "title: Shot test",
      "---",
      "",
      "import Shot from '../../components/Shot.astro';",
      "",
      '<Shot name="zz-shot-test-here" alt="Both themes exist" />',
      '<Shot name="zz-shot-test-gone" alt="No files" />',
      "",
    ].join("\n"),
  );
  const r = spawnSync("pnpm", ["exec", "astro", "build", "--outDir", "dist-shot-test"], { cwd: root, encoding: "utf8" });
  log = r.stdout + r.stderr;
  assert.equal(r.status, 0, log);
  html = readFileSync(`${out}/zz-shot-test/index.html`, "utf8");
});

after(() => {
  rmSync(pageFile, { force: true });
  rmSync(out, { recursive: true, force: true });
  for (const f of shots) rmSync(f, { force: true });
});

test("ShotShowsThemeVariant", () => {
  const imgs = [...html.matchAll(/<img[^>]*class="(shot-light|shot-dark)"[^>]*>/g)].map((m) => m[0]);
  assert.equal(imgs.length, 2);
  const [light, dark] = [imgs.find((i) => i.includes("shot-light"))!, imgs.find((i) => i.includes("shot-dark"))!];
  assert.match(light, /zz-shot-test-here-light\.[\w-]+\.webp/);
  assert.match(dark, /zz-shot-test-here-dark\.[\w-]+\.webp/);
  assert.match(light, /alt="Both themes exist"/);
  // The built CSS hides the dark image by default and the light one under data-theme="dark".
  const css = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => readFileSync(`${out}${m[1]}`, "utf8")).join("\n");
  assert.match(css, /\.shot \.shot-dark\{display:none\}/);
  assert.match(css, /\[data-theme=dark\] \.shot \.shot-light\{display:none\}/);
  assert.match(css, /\[data-theme=dark\] \.shot \.shot-dark\{display:block\}/);
});

test("ShotPlaceholderRendersWhenFilesMissing", () => {
  assert.match(html, /shot-missing[^>]*data-shot="zz-shot-test-gone"[^>]*>\s*Screenshot missing: zz-shot-test-gone \(light and dark\)/);
  assert.doesNotMatch(html, /zz-shot-test-gone-light\.[\w-]+\.webp/);
  assert.match(log, /\[Shot\] missing light and dark file for "zz-shot-test-gone"/);
  assert.doesNotMatch(log, /missing[^\n]*"zz-shot-test-here"/);
});
