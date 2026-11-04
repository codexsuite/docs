import { execFileSync } from "node:child_process";
import type { PageCheck, Problem } from "./types.ts";

/**
 * Contract 8 and the banned patterns: a link to GitHub names the main branch.
 * Links into this repository are also checked against the files git tracks, so a link
 * to a file that does not exist yet fails before the branch merges.
 */

const docsRepoSlug = "codexsuite/docs";

const urlPattern = /https?:\/\/(?:www\.)?(?:github\.com|raw\.githubusercontent\.com)\/[^\s)<>"'\]`}]+/g;

export interface GithubRef {
  repo: string;
  /** blob, tree, raw, blame, commits, commit, compare, releases/tag, archive or raw.githubusercontent.com */
  kind: string;
  /** The first path segment after the kind. Branch names can contain slashes, so only the first segment is read. */
  ref: string;
  /** The path after the ref, without a query or anchor. */
  path: string;
}

/** Reads a GitHub URL that names a ref. Returns null for pages with no ref, such as issues and pulls. */
export function parseGithubRef(url: string): GithubRef | null {
  const clean = url.replace(/[.,;:]+$/, "").split(/[?#]/)[0]!;
  const raw = /^https?:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([^/]+)(?:\/(.*))?$/.exec(clean);
  if (raw) return { repo: raw[1]!, kind: "raw.githubusercontent.com", ref: raw[2]!, path: raw[3] ?? "" };
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/]+\/[^/]+)\/(blob|tree|raw|blame|commits|commit|compare|releases\/tag|archive)\/([^/]+)(?:\/(.*))?$/.exec(
    clean,
  );
  if (!m) return null;
  return { repo: m[1]!, kind: m[2]!, ref: m[3]!, path: m[4] ?? "" };
}

const trackedCache = new Map<string, Set<string>>();

/** Files git tracks in root, with staged files included. */
export function trackedFiles(root: string): Set<string> {
  let files = trackedCache.get(root);
  if (!files) {
    const out = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    files = new Set(out.split("\0").filter(Boolean));
    trackedCache.set(root, files);
  }
  return files;
}

/** Problems for the links in one text. `source` is the whole file. */
export function linkProblems(root: string, source: string): { line: number; message: string }[] {
  const found: { line: number; message: string }[] = [];
  source.split("\n").forEach((text, i) => {
    for (const m of text.matchAll(urlPattern)) {
      const ref = parseGithubRef(m[0]);
      if (!ref) continue;
      const url = m[0].replace(/[.,;:]+$/, "");
      if (ref.ref !== "main") {
        found.push({ line: i + 1, message: `"${url}" points at "${ref.ref}". Link to main with a blob/main or raw/main URL` });
        continue;
      }
      if (ref.repo.toLowerCase() !== docsRepoSlug) continue;
      if (ref.kind === "blob" || ref.kind === "raw" || ref.kind === "raw.githubusercontent.com" || ref.kind === "blame") {
        if (!trackedFiles(root).has(ref.path)) found.push({ line: i + 1, message: `"${url}": git does not track "${ref.path}"` });
      } else if (ref.kind === "tree" && ref.path) {
        const dir = `${ref.path.replace(/\/$/, "")}/`;
        if (![...trackedFiles(root)].some((f) => f.startsWith(dir))) {
          found.push({ line: i + 1, message: `"${url}": git tracks nothing under "${ref.path}"` });
        }
      }
    }
  });
  return found;
}

export const linksMain: PageCheck = {
  name: "links-main",
  run({ root, page, source }): Problem[] {
    return linkProblems(root, source).map((f) => ({ check: "links-main", slug: page.slug, line: f.line, message: f.message }));
  },
};
