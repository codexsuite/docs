import { existsSync } from "node:fs";
import type { PageCheck, Problem } from "../types.ts";

/** Blanks fenced and inline code so links inside examples are not checked. Keeps line numbers. */
export function blankCode(text: string): string {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line.replace(/`[^`]*`/g, "``");
    })
    .join("\n");
}

const targets = (line: string): string[] => {
  const out: string[] = [];
  for (const m of line.matchAll(/\]\(\s*<?([^)\s>]+)/g)) out.push(m[1]!);
  for (const m of line.matchAll(/\bhref=["']([^"']+)["']/g)) out.push(m[1]!);
  return out;
};

export const internalLinks: PageCheck = {
  name: "internal-links",
  run({ root, page, pages, body, bodyStartLine }) {
    const known = new Set(pages.map((p) => (p.slug === "index" ? "/" : `/${p.slug}/`)));
    const problems: Problem[] = [];
    blankCode(body)
      .split("\n")
      .forEach((line, i) => {
        for (const target of targets(line)) {
          if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue; // external, mailto and same-page anchors
          const add = (message: string) =>
            problems.push({ check: "internal-links", slug: page.slug, line: bodyStartLine + i, message });
          if (!target.startsWith("/")) {
            add(`"${target}" is relative. Internal links are root-relative with a trailing slash`);
            continue;
          }
          const path = target.split(/[#?]/)[0]!;
          if (/\.[a-z0-9]+$/i.test(path)) {
            if (!existsSync(`${root}/public${path}`)) add(`"${target}" is not a file in public/`);
            continue;
          }
          if (!path.endsWith("/")) add(`"${target}" has no trailing slash`);
          else if (!known.has(path)) add(`"${target}" is not a page in the page map`);
        }
      });
    return problems;
  },
};
