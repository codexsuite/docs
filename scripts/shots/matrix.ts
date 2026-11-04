/**
 * Chooses the pages one capture run covers. Prints the matrix as JSON on stdout and the skipped pages on stderr.
 *
 *   tsx scripts/shots/matrix.ts <key|all>
 *
 * A key runs alone, with or without a page map record, so `_smoke` works. "all" takes the keys of the page map
 * that have a spec file. Files that are not in the page map, such as `_throws.ts`, are never selected.
 */
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pages } from "../../src/pagemap.ts";

export interface Legs {
  page: string[];
  skipped: string[];
}

/** Pure selection: the page map keys with a spec file go in the matrix, the rest are skipped. */
export function selectLegs(mapKeys: string[], specKeys: string[]): Legs {
  const specs = new Set(specKeys);
  return { page: mapKeys.filter((k) => specs.has(k)), skipped: mapKeys.filter((k) => !specs.has(k)) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const requested = process.argv[2];
  if (!requested) {
    console.error("Usage: matrix.ts <key|all>");
    process.exit(1);
  }
  if (requested === "all") {
    const specsDir = join(resolve(dirname(fileURLToPath(import.meta.url))), "specs");
    const specKeys = readdirSync(specsDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => f.replace(/\.ts$/, ""));
    const legs = selectLegs(pages.map((p) => p.key), specKeys);
    if (legs.skipped.length > 0) console.error(`Skipped ${legs.skipped.length} page(s) with no spec: ${legs.skipped.join(", ")}`);
    if (legs.page.length === 0) {
      console.error("No page has a spec.");
      process.exit(1);
    }
    console.log(JSON.stringify({ page: legs.page }));
  } else {
    console.log(JSON.stringify({ page: [requested] }));
  }
}
