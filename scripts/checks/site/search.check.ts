import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser } from "playwright";
import { pages, pagePath } from "../../../src/pagemap.ts";
import { serveDist } from "./serve.ts";

// Needs a built site: run `pnpm build` first. Each query is a page title, and the page must
// come back in the first five results of a real Pagefind search in a browser.
const keys = [
  "start-quickstart",
  "start-configuration",
  "start-troubleshooting",
  "start-guides-export-pdf",
  "ui-knowledge-base",
  "ui-sharing",
  "agents-tokens",
  "agents-tools",
  "reference-keyboard",
  "reference-glossary",
  "work-print",
];

let server: Awaited<ReturnType<typeof serveDist>>;
let browser: Browser;

before(async () => {
  server = await serveDist();
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

test("SearchFindsPagesByName", async () => {
  const page = await browser.newPage();
  await page.goto(`${server.url}/`);
  const failures: string[] = [];
  for (const key of keys) {
    const entry = pages.find((p) => p.key === key);
    assert.ok(entry, `${key} is not in the page map`);
    const urls: string[] = await page.evaluate(async (query) => {
      // @ts-expect-error pagefind.js is generated into dist/ by the build.
      const pagefind = await import(/* @vite-ignore */ "/pagefind/pagefind.js");
      const search = await pagefind.search(query);
      const top = await Promise.all(search.results.slice(0, 5).map((r: { data(): Promise<{ url: string }> }) => r.data()));
      return top.map((d: { url: string }) => d.url);
    }, entry.title);
    if (!urls.some((u) => u.replace(/\.html$/, "").replace(/\/?$/, "/") === pagePath(entry))) {
      failures.push(`"${entry.title}" did not find ${pagePath(entry)}. Got ${urls.join(", ") || "nothing"}`);
    }
  }
  assert.deepEqual(failures, []);
});
