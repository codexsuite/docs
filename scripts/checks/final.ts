import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pages as sitePages, type PageEntry } from "../../src/pagemap.ts";
import { checkPage, defaultRoot, formatProblem, type CheckOptions } from "./page.ts";
import type { Problem } from "./types.ts";

/**
 * TODOs that may stay in the shipped files. `contains` is a piece of the TODO's line.
 * Empty on purpose: add an entry only when the conductor agrees the TODO ships.
 */
export const allowedTodos: { file: string; contains: string }[] = [];

function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Everything `check:page` does on every page, plus missing shots and unlisted TODOs in the shipped files. */
export function checkFinal(opts: CheckOptions = {}): Problem[] {
  const root = opts.root ?? defaultRoot;
  const pages: PageEntry[] = opts.pages ?? sitePages;
  const problems = pages.flatMap((p) => checkPage(p.slug, { root, pages }));

  const shipped = [
    ...pages.map((p) => `src/content/docs/${p.slug}.mdx`),
    ...[...walk(`${root}/examples`)].map((f) => f.slice(root.length + 1)),
  ].filter((f) => existsSync(`${root}/${f}`));
  for (const file of shipped) {
    const slug = file.replace(/^src\/content\/docs\//, "").replace(/\.mdx$/, "");
    const lines = readFileSync(`${root}/${file}`, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/<Shot\b[^>]*\bname=["']([^"']+)["']/g)) {
        for (const theme of ["light", "dark"]) {
          if (!existsSync(`${root}/src/assets/shots/${m[1]}-${theme}.webp`)) {
            problems.push({ check: "missing-shot", slug, line: i + 1, message: `src/assets/shots/${m[1]}-${theme}.webp does not exist` });
          }
        }
      }
      if (/\bTODO\b/.test(line) && !allowedTodos.some((a) => a.file === file && line.includes(a.contains))) {
        problems.push({ check: "todo", slug, line: i + 1, message: `unlisted TODO: ${line.trim()}` });
      }
    });
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = checkFinal();
  for (const p of problems) console.error(formatProblem(p));
  console.log(`check:final: ${problems.length} problem(s)`);
  process.exit(problems.length === 0 ? 0 : 1);
}
