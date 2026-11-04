import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pages as sitePages, type PageEntry } from "../../src/pagemap.ts";
import { checkPage, defaultRoot, formatProblem, type CheckOptions } from "./page.ts";
import { blankCode } from "./page-modules/internal-links.ts";
import type { Problem } from "./types.ts";

/**
 * TODOs that may stay in the shipped files. `contains` is a piece of the TODO's line.
 * The plan lists two temporary items, the seed stubs and the placeholder capture workflow.
 * Add an entry only when the conductor agrees the TODO ships.
 */
export const allowedTodos: { file: string; contains: string }[] = [
];

/** Folders scanned for TODOs, as well as the page files. */
const todoRoots = ["src", "scripts", "examples", ".github"];
const textFile = /\.(astro|css|js|json|md|mdx|mjs|ts|tsx|yaml|yml)$/;
const testFile = /\.test\.ts$/;

function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Matches a <Shot> tag over several lines. Quoted values may hold ">". */
const shotTag = /<Shot\b((?:"[^"]*"|'[^']*'|\{[^}]*\}|[^>"'])*)>/g;

/** Everything `check:page` does on every page, plus missing shots and unlisted TODOs in the shipped files. */
export function checkFinal(opts: CheckOptions & { allowedTodos?: { file: string; contains: string }[] } = {}): Problem[] {
  const allowed = opts.allowedTodos ?? allowedTodos;
  const root = opts.root ?? defaultRoot;
  const pages: PageEntry[] = opts.pages ?? sitePages;
  const problems = pages.flatMap((p) => checkPage(p.slug, { root, pages }));

  for (const page of pages) {
    const file = `src/content/docs/${page.slug}.mdx`;
    if (!existsSync(`${root}/${file}`)) continue;
    const text = blankCode(readFileSync(`${root}/${file}`, "utf8"));
    for (const tag of text.matchAll(shotTag)) {
      const name = /\bname=["']([^"']+)["']/.exec(tag[1]!)?.[1];
      if (!name) continue;
      const line = text.slice(0, tag.index).split("\n").length;
      for (const theme of ["light", "dark"]) {
        if (!existsSync(`${root}/src/assets/shots/${name}-${theme}.webp`)) {
          problems.push({ check: "missing-shot", slug: page.slug, line, message: `src/assets/shots/${name}-${theme}.webp does not exist` });
        }
      }
    }
  }

  const finalFile = "scripts/checks/final.ts";
  const scanned = todoRoots
    .flatMap((r) => [...walk(`${root}/${r}`)])
    .map((f) => f.slice(root.length + 1))
    .filter((f) => textFile.test(f) && !testFile.test(f) && f !== finalFile);
  for (const file of scanned) {
    const slug = file.replace(/^src\/content\/docs\//, "").replace(/\.mdx$/, "");
    readFileSync(`${root}/${file}`, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/\bTODO\b/.test(line) && !allowed.some((a) => a.file === file && line.includes(a.contains))) {
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
