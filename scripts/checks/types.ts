import type { PageEntry } from "../../src/pagemap.ts";

/** One finding. `line` is 1-based in the page file, when the finding has a place. */
export interface Problem {
  check: string;
  slug: string;
  message: string;
  line?: number;
}

/** What a page check receives. */
export interface PageContext {
  root: string;
  page: PageEntry;
  pages: PageEntry[];
  /** Path of the page file relative to root. */
  file: string;
  /** The whole file. */
  source: string;
  /** Frontmatter keys. Nested keys are joined with a dot, such as "sidebar.order". */
  frontmatter: Record<string, string>;
  /** The text after the frontmatter. */
  body: string;
  /** 1-based line of the first body line in the file. */
  bodyStartLine: number;
}

/** A page check. `final` checks only run in `check:page` and `check:final`, because stubs fail them. */
export interface PageCheck {
  name: string;
  final?: boolean;
  run(ctx: PageContext): Problem[];
}
