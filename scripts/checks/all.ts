import { fileURLToPath } from "node:url";
import { pages } from "../../src/pagemap.ts";
import { checkPage, formatProblem } from "./page.ts";

// Runs every page check that stubs can pass. Stub markers fail in `check:final` and `check:page`.
export function checkAll() {
  return pages.flatMap((p) => checkPage(p.slug, {}, (c) => !c.final));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = checkAll();
  for (const p of problems) console.error(formatProblem(p));
  console.log(`check: ${pages.length} pages, ${problems.length} problem(s)`);
  process.exit(problems.length === 0 ? 0 : 1);
}
