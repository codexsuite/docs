import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseGithubRef } from "../links-main.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");

/** Addresses that are examples or point at this site. links-main.ts and the build check the latter. */
const skip = [
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/,
  /^https?:\/\/([a-z0-9-]+\.)*example(\.com|\.org|\.net)?(:|\/|$)/,
  /^https?:\/\/docs\.codexsuite\.app(:|\/|$)/,
  /^https?:\/\/github\.com\/codexsuite\/docs(\/|$)/,
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export function externalUrls(): Map<string, string> {
  const files = [...walk(`${root}/src/content/docs`), `${root}/README.md`, ...walk(`${root}/docs`).filter((f) => f.endsWith(".md"))];
  const urls = new Map<string, string>();
  for (const file of files) {
    for (const m of readFileSync(file, "utf8").matchAll(/https?:\/\/[^\s)<>"'\]`}]+/g)) {
      const url = m[0].replace(/[.,;:]+$/, "").replace(/#.*$/, "");
      if (!skip.some((re) => re.test(url)) && !urls.has(url)) urls.set(url, file.slice(root.length + 1));
    }
  }
  return urls;
}

async function status(url: string): Promise<number | string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
        headers: { "user-agent": "codex-docs-link-check (+https://github.com/codexsuite/docs)" },
      });
      await res.body?.cancel();
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return res.status;
    } catch (e) {
      if (attempt === 2) return e instanceof Error ? e.message : String(e);
    }
  }
  return "no answer after three tries";
}

test("ExternalLinksResolve", async () => {
  const urls = externalUrls();
  const failures: string[] = [];
  const queue = [...urls];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [url, file] = next;
        const result = await status(url);
        if (typeof result !== "number" || result >= 400) failures.push(`${url} (${file}) answered ${result}`);
      }
    }),
  );
  assert.deepEqual(failures, []);
});

test("ExternalLinksNameMain", () => {
  const bad = [...externalUrls()].filter(([url]) => {
    const ref = parseGithubRef(url);
    return ref && ref.ref !== "main";
  });
  assert.deepEqual(bad, []);
});
