import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import type { PageEntry } from "../../src/pagemap.ts";

/** A throwaway site root for check tests. `files` maps relative paths to contents. */
export function makeRoot(files: Record<string, string>): string {
  const root = mkdtempSync(`${tmpdir()}/codex-docs-test-`);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(`${root}/${path}`), { recursive: true });
    writeFileSync(`${root}/${path}`, text);
  }
  return root;
}

export const pageA: PageEntry = { key: "a", slug: "a", title: "Page A", description: "d", group: "start", order: 1 };
export const pageB: PageEntry = { key: "b", slug: "sub/b", title: "Page B", description: "d", group: "start", order: 2 };

export const page = (title: string, order: number, body: string, description = "A description."): string =>
  `---\ntitle: "${title}"\ndescription: "${description}"\nsidebar:\n  order: ${order}\n---\n\n${body}\n`;
