import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser } from "playwright";
import { pages, pagePath } from "../../../src/pagemap.ts";
import { serveDist } from "./serve.ts";

// Needs a built site: run `pnpm build` first. Every page in the page map is checked.
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

test("NoOverflowAt390", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const failures: string[] = [];
  for (const entry of pages) {
    await page.goto(`${server.url}${pagePath(entry)}`, { waitUntil: "load" });
    const widest = await page.evaluate(() => {
      const limit = document.documentElement.clientWidth;
      const wide = [...document.body.querySelectorAll("*")]
        .filter((el) => el.getBoundingClientRect().right > limit + 1 && !el.closest("pre, table, .expressive-code, [hidden]"))
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0] ?? ""}`);
      return { scroll: document.documentElement.scrollWidth, limit, wide };
    });
    if (widest.scroll > widest.limit) {
      failures.push(`${pagePath(entry)} is ${widest.scroll}px wide in a ${widest.limit}px viewport. Wide: ${widest.wide.join(", ") || "unknown"}`);
    }
  }
  assert.deepEqual(failures, []);
});
