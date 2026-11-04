import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { PageCheck, Problem } from "./types.ts";

/**
 * Unslop's mechanical rules (docs/unslop.md). Rule numbers match the skill.
 * The check reads prose only. It skips fenced code, inline code, frontmatter keys,
 * import and export lines, link targets and the generated tool tables.
 */

/** SHA-256 of docs/unslop.md. Update it only when the skill is copied again from upstream. */
export const unslopSha256 = "f686e9bc70c3a84b5a68d187df52b4adfc628508963f594fddf7e9e285e7bf9b";

/** The generated tool tables sit between two of these markers. */
const generatedMarker = /\{\s*\/\*\s*generated\s*\*\/\s*\}/;

/** Proper nouns that keep a capital letter inside a sentence-case heading. */
export const properNouns = new Set(
  [
    "Codex", "Claude", "Code", "Docker", "Compose", "Caddy", "Postgres", "PostgreSQL", "Cloudflare", "GitHub",
    "Markdown", "Pandoc", "Linux", "Windows", "macOS", "WSL", "OpenAI", "Anthropic", "Pagefind", "Starlight",
    "Astro", "Seq", "Kindle", "Landlock", "Working", "Coasts", "Salt", "Signal", "Tide", "Tables", "Edith",
    "Marrow", "Tobias", "Venn", "Harrowmouth", "Fresnel", "Harbour", "Press", "Tidewater", "Review", "English",
    "Needs", "Penhallow", "Okafor", "Keeper's", "Ledger", "Signals", "Sea", "Light", "Keepers", "Last", "Watch",
    "Ghcr", "Cursor", "Gemini", "Copilot", "VS", "Node", "Ollama", "Anthropic's", "OpenAI's",
  ].map((w) => w.toLowerCase()),
);

const smallWords = new Set(
  "a an the and or but nor for of to in on at by with from as vs via per into onto over is are be it its if so not".split(" "),
);

interface Rule {
  rule: number;
  re: RegExp;
  message: (m: RegExpExecArray) => string;
}

const words = (list: string, rule: number, what: string): Rule => ({
  rule,
  re: new RegExp(`\\b(${list})\\b`, "gi"),
  message: (m) => `rule ${rule}: "${m[0]}" is ${what}. Use a plain word`,
});

const phrases = (list: string, rule: number, what: string): Rule => ({
  rule,
  re: new RegExp(`(?<![\\w])(${list})(?![\\w])`, "gi"),
  message: (m) => `rule ${rule}: "${m[0]}" is ${what}`,
});

const lineRules: Rule[] = [
  {
    rule: 3,
    re: /,\s+(ensuring|highlighting|reflecting|showcasing|fostering|underscoring|emphasizing|emphasising|demonstrating|enabling)\b/gi,
    message: (m) => `rule 3: the "-ing" tail ", ${m[1]}" adds nothing. Delete it or say what happens`,
  },
  words(
    "additionally|crucial|delves?|delving|enduring|enhances?|enhanced|enhancing|enhancements?|fostering|garners?|garnered|interplay|intricate|landscapes?|pivotal|showcases?|showcased|showcasing|tapestry|testament|underscores?|underscored|underscoring|vibrant",
    7,
    "AI vocabulary",
  ),
  phrases("serves as|serve as|served as|stands as|stand as|boasts?|boasting", 8, 'a fancy way to say "is" or "has"'),
  {
    rule: 8,
    re: /\b(it|which|that|this|app|page|screen|site|editor|tool|server) features\b/gi,
    message: (m) => `rule 8: "${m[0]}" is a fancy way to say "has"`,
  },
  phrases("not just [^.;]{1,40}?,? but(?: also)?", 9, 'the "not just X, but Y" pattern. State the point directly'),
  {
    rule: 13,
    re: /[—–]|(?<=\s)--(?=\s)|(?<=\S\s)-(?=\s\S)/g,
    message: (m) =>
      `rule 13: ${m[0] === "—" ? "an em dash" : m[0] === "–" ? "an en dash" : "a hyphen used as a dash"}. Use a period or a comma`,
  },
  {
    rule: 18,
    re: /\p{Extended_Pictographic}/gu,
    message: () => "rule 18: emojis are not allowed",
  },
  {
    rule: 19,
    re: /[‘’“”]/g,
    message: (m) => `rule 19: a curly quote (${m[0]}). Use a straight quote`,
  },
  phrases(
    "in order to|due to the fact that|it is important to note that|it'?s important to note that|it is worth noting that|it'?s worth noting that|at this point in time|for the purpose of|has the ability to|have the ability to|in the event that",
    23,
    "filler. Shorten it or delete it",
  ),
  words(
    "utili[sz](?:e|es|ed|ing|ation)|leverag(?:e|es|ed|ing)|facilitat(?:e|es|ed|ing)|numerous",
    31,
    "a fancier word than needed",
  ),
  words(
    "substrates?|wedges?|vectors?|locus|vantage|nexus|primitives?|harness|harnesses|bedrock|scaffolding|modalit(?:y|ies)|paradigms?|gold-plating|gold-plated|ratchets?|evacuate|evacuates|endgame|flywheel",
    26,
    "an abstract metaphor noun",
  ),
  {
    rule: 26,
    re: /\b(API surface|north star)\b/gi,
    message: (m) => `rule 26: "${m[0]}" is an abstract metaphor. Pick the concrete word`,
  },
];

export interface ProseLine {
  /** 1-based line in the file. */
  line: number;
  text: string;
  /** True when the line was a frontmatter value, which is not a heading. */
  frontmatter: boolean;
}

/** Returns the prose lines of a file with code, targets and exempt regions blanked. Keeps line numbers. */
export function proseLines(source: string): ProseLine[] {
  const lines = source.split("\n");
  const out: ProseLine[] = [];
  let i = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      for (let n = 1; n < end; n++) {
        const m = /^\s*[A-Za-z0-9_-]+:\s*(.*)$/.exec(lines[n]!);
        if (m && m[1]) out.push({ line: n + 1, text: m[1].replace(/^(["'])(.*)\1$/, "$2"), frontmatter: true });
      }
      i = end + 1;
    }
  }
  let fence: string | null = null;
  let generated = false;
  for (; i < lines.length; i++) {
    const raw = lines[i]!;
    const f = /^\s*(`{3,}|~{3,})/.exec(raw);
    if (fence) {
      if (f && f[1]!.startsWith(fence[0]!) && f[1]!.length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1]!;
      continue;
    }
    if (generatedMarker.test(raw)) {
      generated = !generated;
      continue;
    }
    if (generated || /^(import|export)\s/.test(raw)) continue;
    const text = raw
      .replace(/`[^`]*`/g, " ")
      .replace(/\]\([^)]*\)/g, "] ")
      .replace(/https?:\/\/[^\s)>"'\]]+/g, " ")
      .replace(/\b(?:href|src)=("[^"]*"|'[^']*')/g, " ");
    out.push({ line: i + 1, text, frontmatter: false });
  }
  return out;
}

/** Rule 17. Returns the words that make a heading title case. */
export function titleCaseWords(heading: string): string[] {
  const text = heading
    .replace(/\{#[^}]*\}\s*$/, "")
    .replace(/\[([^\]]*)\]/g, "$1")
    .replace(/[*_]/g, "");
  const tokens = text.split(/\s+/).filter(Boolean);
  const bad: string[] = [];
  tokens.slice(1).forEach((token) => {
    const word = token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9']+$/g, "");
    if (!/^[A-Z][a-z']*$/.test(word) || word.length === 0) return; // lower case, ALLCAPS and mixed case pass
    if (smallWords.has(word.toLowerCase()) || properNouns.has(word.toLowerCase())) return;
    bad.push(word);
  });
  return bad;
}

/** Applies the mechanical rules to the text of one file. */
export function scanProse(source: string): { line: number; message: string }[] {
  const found: { line: number; message: string }[] = [];
  for (const { line, text, frontmatter } of proseLines(source)) {
    for (const r of lineRules) {
      r.re.lastIndex = 0;
      for (let m = r.re.exec(text); m; m = r.re.exec(text)) found.push({ line, message: r.message(m) });
    }
    const heading = frontmatter ? null : /^\s{0,3}#{1,6}\s+(.*)$/.exec(text);
    if (heading) {
      const bad = titleCaseWords(heading[1]!);
      if (bad.length) found.push({ line, message: `rule 17: the heading is title case (${bad.join(", ")}). Use sentence case` });
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

export const slop: PageCheck = {
  name: "slop",
  run({ page, source }) {
    return scanProse(source).map((f) => ({ check: "slop", slug: page.slug, line: f.line, message: f.message }));
  },
};

/** The repository documents the lint also reads, where they exist. */
export function repoDocFiles(root: string): string[] {
  const files = ["README.md", "AGENTS.md"].filter((f) => existsSync(`${root}/${f}`));
  if (existsSync(`${root}/docs`)) {
    for (const f of readdirSync(`${root}/docs`).sort()) {
      if (f.endsWith(".md") && f !== "unslop.md") files.push(`docs/${f}`);
    }
  }
  return files;
}

/** docs/unslop.md is the rule text, so it is checked against the recorded hash instead of the rules. */
export function checkUnslopCopy(root: string): Problem[] {
  const file = `${root}/docs/unslop.md`;
  if (!existsSync(file)) return [{ check: "unslop-copy", slug: "docs/unslop.md", message: "docs/unslop.md does not exist" }];
  const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
  return actual === unslopSha256
    ? []
    : [{ check: "unslop-copy", slug: "docs/unslop.md", message: `the file hash is ${actual}, not the recorded ${unslopSha256}` }];
}

/** README.md, AGENTS.md and docs/*.md, plus the Unslop copy. */
export function checkRepoDocs(root: string): Problem[] {
  const problems = checkUnslopCopy(root);
  for (const file of repoDocFiles(root)) {
    for (const f of scanProse(readFileSync(`${root}/${file}`, "utf8"))) {
      problems.push({ check: "slop", slug: file, line: f.line, message: f.message });
    }
  }
  return problems;
}
