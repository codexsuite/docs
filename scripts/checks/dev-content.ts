import type { PageCheck, Problem } from "./types.ts";

/**
 * Pages are for people who run and use Codex. They leave out building from source, cloning the
 * product repository, the dev database and seed, running tests, contributing and code layout.
 * Fenced code is scanned too, because commands live there.
 */

interface Ban {
  re: RegExp;
  what: string;
}

const bans: Ban[] = [
  { re: /\bgit\s+clone\b/i, what: "git clone" },
  { re: /\bdotnet\b/i, what: "dotnet" },
  { re: /\b(?:pnpm|npm|yarn|bun)\s+(?:install|ci|i|add|dev|test|build|run|exec)\b/i, what: "a package manager command" },
  { re: /\bnpx\b/i, what: "npx" },
  { re: /\bdb[-_:]reset\b/i, what: "db-reset" },
  { re: /\bdocker\s+build\b/i, what: "docker build" },
  { re: /\bdocker\s+compose\b[^\n]*\s--build\b/i, what: "docker compose --build" },
  { re: /\bdocker\s+compose\s+build\b/i, what: "docker compose build" },
  { re: /\bmake\s+(?:build|test|dev|run)\b/i, what: "make" },
  { re: /\b(?:build(?:ing)?|compil(?:e|ing)|run(?:ning)?)\s+(?:it\s+|codex\s+)?from\s+source\b/i, what: "building from source" },
  { re: /\bsrc\/docker-compose\.ya?ml\b/i, what: "the source build compose file" },
  { re: /\bdev(?:elopment)?\s+(?:database|db|container|environment|setup)\b/i, what: "a development environment" },
  { re: /\b(?:run|running|write|writing)\s+(?:the\s+|your\s+)?(?:unit\s+|integration\s+)?tests\b/i, what: "running tests" },
  { re: /\bcontribut(?:e|es|ing|ion|ions|or|ors)\b/i, what: "contributing" },
  { re: /\.(?:csproj|sln)\b/i, what: "a project file" },
];

export function devContentProblems(source: string): { line: number; message: string }[] {
  const found: { line: number; message: string }[] = [];
  source.split("\n").forEach((text, i) => {
    for (const b of bans) {
      if (b.re.test(text)) found.push({ line: i + 1, message: `developer content (${b.what}). Pages cover running and using Codex only` });
    }
  });
  return found;
}

export const devContent: PageCheck = {
  name: "dev-content",
  run({ page, source }): Problem[] {
    return devContentProblems(source).map((f) => ({ check: "dev-content", slug: page.slug, line: f.line, message: f.message }));
  },
};
