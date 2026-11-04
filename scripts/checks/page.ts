import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pages as sitePages, type PageEntry } from "../../src/pagemap.ts";
import { frontmatter } from "./page-modules/frontmatter.ts";
import { internalLinks } from "./page-modules/internal-links.ts";
import { stubMarker } from "./page-modules/stub-marker.ts";
import type { PageCheck, PageContext, Problem } from "./types.ts";

export const defaultRoot = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");

/**
 * Contract 9. The page checks, in the order they run. Add a module here and it runs for
 * `check:page`, `check` and `check:final`.
 */
export const pageChecks: PageCheck[] = [frontmatter, stubMarker, internalLinks];

export interface CheckOptions {
  root?: string;
  pages?: PageEntry[];
}

/** Reads the nested one-level frontmatter a page uses. Keys are joined with a dot. */
export function parseFrontmatter(source: string): { values: Record<string, string>; bodyStartLine: number } {
  const values: Record<string, string> = {};
  if (!source.startsWith("---\n")) return { values, bodyStartLine: 1 };
  const lines = source.split("\n");
  const end = lines.indexOf("---", 1);
  if (end === -1) return { values, bodyStartLine: 1 };
  let parent = "";
  for (const line of lines.slice(1, end)) {
    const m = /^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1] ? `${parent}.${m[2]}` : m[2]!;
    const value = m[3]!.replace(/^(["'])(.*)\1$/, "$2");
    if (!m[1]) parent = m[2]!;
    if (value !== "") values[key] = value;
  }
  return { values, bodyStartLine: end + 2 };
}

export function findPage(id: string, pages: PageEntry[]): PageEntry | undefined {
  const slug = id.replace(/^\/+|\/+$/g, "").replace(/\.mdx$/, "") || "index";
  return pages.find((p) => p.slug === slug || p.key === slug);
}

/** Runs the checks on one page. `include` picks which checks run. */
export function checkPage(
  id: string,
  opts: CheckOptions = {},
  include: (c: PageCheck) => boolean = () => true,
): Problem[] {
  const root = opts.root ?? defaultRoot;
  const pages = opts.pages ?? sitePages;
  const page = findPage(id, pages);
  if (!page) return [{ check: "page", slug: id, message: `"${id}" is not a page in the page map` }];
  const file = `src/content/docs/${page.slug}.mdx`;
  if (!existsSync(`${root}/${file}`)) return [{ check: "page", slug: page.slug, message: `${file} does not exist` }];
  const source = readFileSync(`${root}/${file}`, "utf8");
  const { values, bodyStartLine } = parseFrontmatter(source);
  const body = source.split("\n").slice(bodyStartLine - 1).join("\n");
  const ctx: PageContext = { root, page, pages, file, source, frontmatter: values, body, bodyStartLine };
  return pageChecks.filter(include).flatMap((c) => c.run(ctx));
}

export function formatProblem(p: Problem): string {
  return `${p.check}: ${p.slug}${p.line ? `:${p.line}` : ""}: ${p.message}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: pnpm check:page <slug>");
    process.exit(2);
  }
  const problems = checkPage(id);
  for (const p of problems) console.error(formatProblem(p));
  console.log(problems.length === 0 ? `check:page ${id}: ok` : `check:page ${id}: ${problems.length} problem(s)`);
  process.exit(problems.length === 0 ? 0 : 1);
}
