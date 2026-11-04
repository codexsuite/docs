import type { PageCheck, Problem } from "../types.ts";

export const frontmatter: PageCheck = {
  name: "frontmatter",
  run({ page, file, source, frontmatter: fm }) {
    const problems: Problem[] = [];
    const add = (message: string) => problems.push({ check: "frontmatter", slug: page.slug, message });
    if (!source.startsWith("---\n")) {
      add(`${file} does not start with frontmatter`);
      return problems;
    }
    if (fm["title"] !== page.title) add(`title is "${fm["title"] ?? ""}", the page map says "${page.title}". Keep the title`);
    if (!fm["description"]) add("description is missing or empty");
    if (fm["sidebar.order"] !== String(page.order)) {
      add(`sidebar.order is "${fm["sidebar.order"] ?? ""}", the page map says ${page.order}`);
    }
    return problems;
  },
};
