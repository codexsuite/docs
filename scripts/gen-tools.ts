/**
 * Contract 14. Writes src/content/docs/agents/tools.mdx from the MCP registrations in the product.
 *
 *   pnpm tools:gen <product>     write the page
 *   pnpm tools:check <product>   fail when the page and the product differ
 *
 * <product> is a clean checkout of codexsuite/codex at the commit to document, for example a temporary
 * `git worktree add <dir> origin/main`. The script reads files in it and never assumes a path.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const pagePath = "src/content/docs/agents/tools.mdx";

const mcpDir = "src/Codex.Application/Mcp";
const scopesFile = `${mcpDir}/McpScopes.cs`;
const errorCodesFile = `${mcpDir}/McpErrorCodes.cs`;
const budgetFile = `${mcpDir}/McpGenerationBudget.cs`;
const tokenScopesFile = "src/Codex.Application/Identity/ApiTokenScopes.cs";
const apiErrorCodesFile = "src/Codex.Contracts/Errors/ApiErrorCodes.cs";
const mcpDoc = "docs/mcp.md";

// ---------------------------------------------------------------------------------------------
// A small C# reader. It knows strings, comments and brackets, which is all the attributes need.

function skipString(s: string, i: number): number {
  let j = i;
  let interpolated = 0;
  let verbatim = false;
  while (s[j] === "$" || s[j] === "@") {
    if (s[j] === "$") interpolated++;
    else verbatim = true;
    j++;
  }
  if (s.startsWith('"""', j)) {
    let quotes = 3;
    while (s[j + quotes] === '"') quotes++;
    const close = s.indexOf('"'.repeat(quotes), j + quotes);
    if (close === -1) throw new Error("unterminated raw string");
    return close + quotes;
  }
  j++;
  for (; j < s.length; j++) {
    if (verbatim) {
      if (s[j] === '"') {
        if (s[j + 1] === '"') j++;
        else return j + 1;
      }
    } else if (s[j] === "\\") j++;
    else if (s[j] === '"') return j + 1;
  }
  throw new Error("unterminated string");
}

function skipTrivia(s: string, i: number): number {
  for (;;) {
    while (i < s.length && /\s/.test(s[i]!)) i++;
    if (s.startsWith("//", i)) i = s.indexOf("\n", i) === -1 ? s.length : s.indexOf("\n", i);
    else if (s.startsWith("/*", i)) i = s.indexOf("*/", i) + 2;
    else return i;
  }
}

/** Index just after the closer that matches the opener at s[i]. */
function matchClose(s: string, i: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [pairs[s[i]!]!];
  let j = i + 1;
  while (j < s.length && stack.length) {
    const c = s[j]!;
    if (c === '"' || ((c === "$" || c === "@") && /^[$@]*"/.test(s.slice(j, j + 4)))) {
      j = skipString(s, j);
    } else if (c === "'") {
      j = s[j + 1] === "\\" ? s.indexOf("'", j + 3) + 1 : j + 3;
    } else if (s.startsWith("//", j) || s.startsWith("/*", j)) {
      j = skipTrivia(s, j);
    } else {
      if (pairs[c]) stack.push(pairs[c]!);
      else if (c === stack[stack.length - 1]) stack.pop();
      j++;
    }
  }
  if (stack.length) throw new Error("unbalanced brackets");
  return j;
}

/** Splits at commas that are not inside brackets, generics or strings. */
function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let j = 0; j < s.length; j++) {
    const c = s[j]!;
    if (c === '"' || ((c === "$" || c === "@") && /^[$@]*"/.test(s.slice(j, j + 4)))) {
      j = skipString(s, j) - 1;
    } else if (s.startsWith("//", j) || s.startsWith("/*", j)) {
      j = skipTrivia(s, j) - 1;
    } else if ("([{<".includes(c)) depth++;
    else if (c === ">" && s[j - 1] === "=") continue;
    else if (")]}>".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      parts.push(s.slice(start, j));
      start = j + 1;
    }
  }
  if (s.slice(start).trim()) parts.push(s.slice(start));
  return parts.map((p) => p.trim());
}

function decodeLiteral(raw: string): string {
  if (/^[$]/.test(raw)) throw new Error(`interpolated string in an attribute: ${raw.slice(0, 40)}`);
  if (raw.startsWith("@")) return raw.slice(2, -1).replace(/""/g, '"');
  return raw.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_m, e: string) => {
    if (e[0] === "u") return String.fromCharCode(parseInt(e.slice(1), 16));
    return ({ n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\", "'": "'" } as Record<string, string>)[e] ?? e;
  });
}

/** `"a" + "b"` to `ab`. Anything that is not a literal throws. */
function stringExpr(expr: string): string {
  let out = "";
  let i = skipTrivia(expr, 0);
  for (;;) {
    if (!/^[$@]*"/.test(expr.slice(i, i + 4))) throw new Error(`not a string literal: ${expr.slice(i, i + 40)}`);
    const end = skipString(expr, i);
    out += decodeLiteral(expr.slice(i, end));
    i = skipTrivia(expr, end);
    if (i >= expr.length) return out;
    if (expr[i] !== "+") throw new Error(`unexpected ${expr.slice(i, i + 20)} in a string expression`);
    i = skipTrivia(expr, i + 1);
  }
}

interface Attribute {
  name: string;
  args: string;
}

/** Reads `[A(...)] [B] [C(...), D]` groups from i. Returns the attributes and the index after them. */
function readAttributes(s: string, i: number): { attrs: Attribute[]; end: number } {
  const attrs: Attribute[] = [];
  i = skipTrivia(s, i);
  while (s[i] === "[") {
    const end = matchClose(s, i);
    for (const part of splitTop(s.slice(i + 1, end - 1))) {
      const m = /^([\w.]+)\s*(?:\(([\s\S]*)\))?$/.exec(part);
      if (m) attrs.push({ name: m[1]!, args: m[2] ?? "" });
    }
    i = skipTrivia(s, end);
  }
  return { attrs, end: i };
}

function namedArg(args: string, name: string): string | undefined {
  for (const part of splitTop(args)) {
    const m = new RegExp(`^${name}\\s*=\\s*([\\s\\S]*)$`).exec(part);
    if (m) return m[1]!.trim();
  }
  return undefined;
}

function namedString(args: string, name: string): string | undefined {
  const v = namedArg(args, name);
  return v === undefined ? undefined : stringExpr(v);
}

// ---------------------------------------------------------------------------------------------
// The model

export interface Param {
  name: string;
  required: boolean;
  description: string;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  params: Param[];
  scope: string;
  extraScopes: string[];
  readOnly: boolean;
  destructive: boolean;
  group: string;
}

export interface Prompt {
  name: string;
  title: string;
  description: string;
  params: Param[];
}

export interface Resource {
  uri: string;
  name: string;
  mime: string;
  description: string;
}

export interface ErrorRow {
  codes: string[];
  when: string;
  extra: string;
}

export interface Limit {
  setting: string;
  defaultValue: string;
}

export interface ProductModel {
  commit: string;
  tools: Tool[];
  prompts: Prompt[];
  resources: Resource[];
  scopes: { scope: string; tools: string[] }[];
  errors: ErrorRow[];
  limit: Limit;
}

const skippedParamTypes = /^(McpServer|CancellationToken|IProgress<|RequestContext<|IServiceProvider|ClaimsPrincipal)/;

function readParams(src: string, openParen: number, owner: string): Param[] {
  const close = matchClose(src, openParen);
  const params: Param[] = [];
  for (const raw of splitTop(src.slice(openParen + 1, close - 1))) {
    const { attrs, end } = readAttributes(raw, 0);
    const rest = raw.slice(end).trim();
    const eq = splitTop(rest.replace(/=(?!>)/, ",")); // first top-level "=" becomes a split point
    const declaration = eq[0]!.trim();
    const hasDefault = eq.length > 1;
    const name = /([A-Za-z_]\w*)$/.exec(declaration)?.[1];
    const type = declaration.slice(0, declaration.length - (name?.length ?? 0)).trim();
    if (!name) throw new Error(`${owner}: cannot read parameter "${raw.slice(0, 60)}"`);
    if (skippedParamTypes.test(type) || attrs.some((a) => a.name === "FromServices")) continue;
    const desc = attrs.find((a) => a.name === "Description");
    params.push({ name, required: !hasDefault, description: desc ? stringExpr(desc.args) : "" });
  }
  return params;
}

interface Found {
  attr: Attribute;
  description: string;
  params: Param[];
}

/** Finds every method carrying the attribute, with its [Description] and parameters. */
function findMethods(src: string, attribute: string, file: string): Found[] {
  const out: Found[] = [];
  const re = new RegExp(`^[ \\t]*\\[${attribute}\\(`, "gm");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = src.indexOf("[", m.index);
    const { attrs, end } = readAttributes(src, start);
    const attr = attrs.find((a) => a.name === attribute)!;
    const label = `${file}: ${namedArg(attr.args, "Name") ?? namedArg(attr.args, "UriTemplate") ?? attribute}`;
    const desc = attrs.find((a) => a.name === "Description");
    if (!desc) throw new Error(`${label} has no [Description]`);
    const open = src.indexOf("(", end);
    out.push({ attr, description: stringExpr(desc.args), params: readParams(src, open, label) });
  }
  return out;
}

function listCs(product: string, dir: string): string[] {
  const full = join(product, dir);
  return readdirSync(full)
    .filter((f) => f.endsWith(".cs") && statSync(join(full, f)).isFile())
    .sort();
}

function read(product: string, file: string): string {
  const path = join(product, file);
  if (!existsSync(path)) throw new Error(`${file} is not in ${product}. Pass a checkout of codexsuite/codex.`);
  return readFileSync(path, "utf8");
}

function constants(src: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of src.matchAll(/public const string (\w+)\s*=\s*([^;]+);/g)) map.set(m[1]!, m[2]!.trim());
  return map;
}

function resolveLiteral(value: string, others: Map<string, string>): string {
  if (value.startsWith('"')) return stringExpr(value);
  const ref = /^\w+\.(\w+)$/.exec(value)?.[1];
  const next = ref ? others.get(ref) : undefined;
  if (!next) throw new Error(`cannot resolve constant ${value}`);
  return resolveLiteral(next, others);
}

const groupTitles: [RegExp, string][] = [
  [/read only/i, "Reading"],
  [/writes/i, "Writing"],
  [/books/i, "Books and series"],
  [/references/i, "References"],
  [/images/i, "Images, figures and openers"],
];
const otherGroup = "Other tools";

/** Tool names in the order docs/mcp.md lists them, with the section title each sits under. */
function docGroups(doc: string): Map<string, string> {
  const map = new Map<string, string>();
  let group = "";
  for (const line of doc.split("\n")) {
    const h = /^## Tools \((.*)\)/.exec(line);
    if (h) {
      const found = groupTitles.find(([re]) => re.test(h[1]!));
      if (!found) throw new Error(`docs/mcp.md has a tools section "${h[1]}" that gen-tools.ts has no title for`);
      group = found[1];
    } else if (/^## /.test(line)) group = "";
    else if (group) {
      const row = /^\|\s*`([a-z_]+)`\s*\|/.exec(line);
      if (row && !map.has(row[1]!)) map.set(row[1]!, group);
    }
  }
  return map;
}

function docErrors(doc: string): ErrorRow[] {
  const lines = doc.split("\n");
  const at = lines.findIndex((l) => /^## Errors/.test(l));
  if (at === -1) throw new Error("docs/mcp.md has no Errors section");
  const rows: ErrorRow[] = [];
  for (const line of lines.slice(at + 1)) {
    if (/^## /.test(line)) break;
    if (!line.startsWith("|")) continue;
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
    const codes = [...(cells[0] ?? "").matchAll(/`([a-z_]+)`/g)].map((c) => c[1]!);
    if (codes.length) rows.push({ codes, when: cells[1] ?? "", extra: cells[2] ?? "" });
  }
  return rows;
}

function productCommit(product: string): string {
  try {
    const git = (args: string[]) => execFileSync("git", ["-C", product, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    if (resolve(git(["rev-parse", "--show-toplevel"]).trim()) !== resolve(product)) return "unknown";
    const dirty = git(["status", "--porcelain", "--", mcpDir, mcpDoc, tokenScopesFile, apiErrorCodesFile]).trim();
    if (dirty) throw new Error(`${product} has uncommitted changes in the MCP sources. Pass a clean checkout, such as a temporary git worktree of origin/main.`);
    return git(["rev-parse", "--short", "HEAD"]).trim();
  } catch (e) {
    if (e instanceof Error && e.message.includes("uncommitted")) throw e;
    return "unknown";
  }
}

export function readProduct(product: string): ProductModel {
  const commit = productCommit(product);
  const doc = read(product, mcpDoc);
  const scopeConsts = constants(read(product, tokenScopesFile));
  const scopeValue = (ref: string): string => resolveLiteral(ref, scopeConsts);

  const forTool = new Map<string, string>();
  for (const m of read(product, scopesFile).matchAll(/\["(\w+)"\]\s*=\s*ApiTokenScopes\.(\w+)/g)) {
    forTool.set(m[1]!, scopeValue(`ApiTokenScopes.${m[2]}`));
  }
  const extra = new Map<string, Set<string>>();
  const files = listCs(product, mcpDir);
  for (const f of files) {
    for (const m of read(product, `${mcpDir}/${f}`).matchAll(/RequireScope\(\s*[\w.]+,\s*"(\w+)",\s*ApiTokenScopes\.(\w+)\)/g)) {
      const set = extra.get(m[1]!) ?? new Set<string>();
      set.add(scopeValue(`ApiTokenScopes.${m[2]}`));
      extra.set(m[1]!, set);
    }
  }

  const groups = docGroups(doc);
  const tools: Tool[] = [];
  const prompts: Prompt[] = [];
  const resources: Resource[] = [];
  for (const f of files) {
    const src = read(product, `${mcpDir}/${f}`);
    for (const t of findMethods(src, "McpServerTool", f)) {
      const name = namedString(t.attr.args, "Name");
      if (!name) throw new Error(`${f}: a tool has no Name`);
      const scope = forTool.get(name);
      if (!scope) throw new Error(`${name} has no row in ${scopesFile}`);
      tools.push({
        name,
        title: namedString(t.attr.args, "Title") ?? "",
        description: t.description,
        params: t.params,
        scope,
        extraScopes: [...(extra.get(name) ?? [])].filter((s) => s !== scope),
        readOnly: namedArg(t.attr.args, "ReadOnly") === "true",
        destructive: namedArg(t.attr.args, "Destructive") === "true",
        group: groups.get(name) ?? otherGroup,
      });
    }
    for (const p of findMethods(src, "McpServerPrompt", f)) {
      prompts.push({
        name: namedString(p.attr.args, "Name") ?? "",
        title: namedString(p.attr.args, "Title") ?? "",
        description: p.description,
        params: p.params,
      });
    }
    for (const r of findMethods(src, "McpServerResource", f)) {
      resources.push({
        uri: namedString(r.attr.args, "UriTemplate") ?? "",
        name: namedString(r.attr.args, "Name") ?? "",
        mime: namedString(r.attr.args, "MimeType") ?? "",
        description: r.description,
      });
    }
  }
  if (!tools.length) throw new Error(`No [McpServerTool] found under ${mcpDir}. Is ${product} the Codex repository?`);
  for (const name of forTool.keys()) {
    if (!tools.some((t) => t.name === name)) throw new Error(`${scopesFile} lists ${name}, which no [McpServerTool] registers`);
  }

  const order = [...new Set([...groupTitles.map(([, title]) => title), otherGroup])];
  const docOrder = [...groups.keys()];
  tools.sort((a, b) => {
    const g = order.indexOf(a.group) - order.indexOf(b.group);
    if (g) return g;
    const ai = docOrder.indexOf(a.name);
    const bi = docOrder.indexOf(b.name);
    return ai === -1 || bi === -1 ? a.name.localeCompare(b.name) : ai - bi;
  });

  const scopes = [...new Set(forTool.values())].map((scope) => ({
    scope,
    tools: tools.filter((t) => t.scope === scope).map((t) => t.name),
  }));

  // Every code the server can return needs a row in the product's own Errors table.
  const apiCodes = constants(read(product, apiErrorCodesFile));
  const errorConsts = constants(read(product, errorCodesFile));
  const codes: string[] = [];
  for (const [, value] of errorConsts) {
    const code = resolveLiteral(value, apiCodes);
    // McpErrorCodes.FromApiCode turns "validation" into "invalid".
    codes.push(code === "validation" ? "invalid" : code);
  }
  const errors = docErrors(doc);
  for (const code of new Set(codes)) {
    if (!errors.some((e) => e.codes.includes(code))) throw new Error(`Error code ${code} has no row in the Errors table of ${mcpDoc}`);
  }

  const budget = read(product, budgetFile);
  const setting = /const string Setting = "(\w+)"/.exec(budget)?.[1];
  const defaultValue = /const int DefaultLimit = (\d+)/.exec(budget)?.[1];
  if (!setting || !defaultValue) throw new Error(`Cannot read the generation limit from ${budgetFile}`);

  return { commit, tools, prompts, resources, scopes, errors, limit: { setting, defaultValue } };
}

// ---------------------------------------------------------------------------------------------
// The page

/** Makes text safe for a Markdown table cell in MDX. Code spans keep their braces. */
function cell(text: string): string {
  return text
    .replace(/\s*\n\s*/g, " ")
    .split(/(`[^`]*`)/)
    .map((part, i) =>
      (i % 2 ? part : part.replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/</g, "&lt;")).replace(/\|/g, "\\|"),
    )
    .join("");
}

function paramCell(params: Param[]): string {
  if (!params.length) return "None";
  const sorted = [...params.filter((p) => p.required), ...params.filter((p) => !p.required)];
  return sorted
    .map((p) => `\`${p.name}\`${p.required ? " (required)" : ""}${p.description ? `: ${cell(p.description)}` : ""}`)
    .join("<br />");
}

const marker = "{/* generated */}";

function table(header: string[], rows: string[][]): string {
  const lines = [header, header.map(() => "---"), ...rows].map((r) => `| ${r.join(" | ")} |`);
  return `${marker}\n\n${lines.join("\n")}\n\n${marker}`;
}

const frontmatter = `---
title: "Tool reference"
description: "Every MCP tool, prompt and resource, generated from the server."
sidebar:
  order: 4
---`;

export function renderPage(m: ProductModel): string {
  const out: string[] = [frontmatter, ""];
  out.push(
    `Codex serves its tools, prompts and resources at \`/mcp\`. This page lists all of them. It is generated from the server's own definitions, so the names, scopes and descriptions are the ones your agent sees.`,
    "",
    `The server has ${m.tools.length} tools, ${m.prompts.length} prompts and ${m.resources.length} resources. To connect an agent, see [Connect an agent](/agents/connect/). To create a token with the scopes you need, see [Tokens and scopes](/agents/tokens/).`,
    "",
    "## Scopes",
    "",
    "Every token holds `codex:read`. A tool called without its scope fails with `forbidden`, and the message names the scope.",
    "",
    "A call also needs a high enough role on the book it touches. A token with `codex:write` on a book shared to you for viewing fails with `forbidden`.",
    "",
    "`undo` also needs the scope of the tool whose write it reverses. Signing off a book and accepting fair use stay in the app, whatever scopes a token has.",
    "",
    table(["Scope", "Tools"], m.scopes.map((s) => [`\`${s.scope}\``, s.tools.map((t) => `\`${t}\``).join(", ")])),
    "",
    "## Tools",
    "",
    "A tool marked read only never changes anything. Arguments marked required must be set, and the others have defaults.",
    "",
  );
  const groups = [...new Set(m.tools.map((t) => t.group))];
  for (const g of groups) {
    const tools = m.tools.filter((t) => t.group === g);
    out.push(
      `### ${g}`,
      "",
      table(
        ["Tool", "Scope", "What it does", "Arguments"],
        tools.map((t) => [
          `\`${t.name}\`${t.title ? `<br />${cell(t.title)}` : ""}${t.readOnly ? "<br />Read only" : ""}`,
          [t.scope, ...t.extraScopes].map((s, i) => (i ? `also \`${s}\` for some calls` : `\`${s}\``)).join(", "),
          cell(t.description),
          paramCell(t.params),
        ]),
      ),
      "",
    );
  }
  out.push(
    "## Prompts",
    "",
    "Prompts appear in an agent as commands. They only read, so they need `codex:read`. The writes they send the agent to make are checked against the token when the agent calls the tool.",
    "",
    table(
      ["Prompt", "What it does", "Arguments"],
      m.prompts.map((p) => [`\`${p.name}\`<br />${cell(p.title)}`, cell(p.description), paramCell(p.params)]),
    ),
    "",
    "## Resources",
    "",
    "Resources are read-only context an agent can pin. Each one returns what the matching tool returns. They need `codex:read`.",
    "",
    table(
      ["Resource", "What it holds", "Format"],
      m.resources.map((r) => [`\`${r.uri}\`<br />${cell(r.name)}`, cell(r.description), `\`${r.mime}\``]),
    ),
    "",
    "## Limits",
    "",
    table(
      ["Setting", "Default", "What happens at the limit"],
      [[`\`${m.limit.setting}\``, m.limit.defaultValue, "`draft_prose` calls per token in an hour. The next call fails with `rate_limited`."]],
    ),
    "",
    "## Errors",
    "",
    'A failed call returns a tool error. Its text is JSON with `ok` set to false and an `error` object that holds `code`, `message` and, for some errors, the extra fields below. A resource or prompt that fails is a protocol error whose message is "code: message".',
    "",
    table(
      ["Code", "When", "Extra fields"],
      m.errors.map((e) => [e.codes.map((c) => `\`${c}\``).join(", "), cell(e.when), cell(e.extra)]),
    ),
    "",
  );
  return out.join("\n");
}

// ---------------------------------------------------------------------------------------------
// The check

const rowKey = (line: string): string => /^\|\s*([^|]*?)(?:<br \/>|\s*\|)/.exec(line)?.[1] ?? line;

/** Names what differs between the committed page and a fresh one. Empty when they match. */
export function diffPages(committed: string, fresh: string): string[] {
  if (committed === fresh) return [];
  const rows = (s: string) => new Map(s.split("\n").filter((l) => l.startsWith("| `")).map((l) => [rowKey(l), l]));
  const have = rows(committed);
  const want = rows(fresh);
  const problems: string[] = [];
  for (const [k, line] of want) {
    if (!have.has(k)) problems.push(`${k} is missing from the page`);
    else if (have.get(k) !== line) problems.push(`${k} has changed in the server`);
  }
  for (const k of have.keys()) if (!want.has(k)) problems.push(`${k} is on the page but not in the server`);
  if (!problems.length) problems.push("the text around the tables has changed");
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Command line

export interface CliOptions {
  product?: string;
  check: boolean;
  out: string;
}

export function parseArgs(argv: string[]): CliOptions {
  let check = false;
  let out = join(repoRoot, pagePath);
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--check") check = true;
    else if (a === "--out") out = resolve(argv[++i] ?? "");
    else rest.push(a);
  }
  return { product: rest[0], check, out };
}

export function run(argv: string[]): number {
  const opts = parseArgs(argv);
  if (!opts.product) {
    console.error(
      "gen-tools: pass the product checkout as the first argument.\n" +
        "  pnpm tools:gen <product>\n  pnpm tools:check <product>\n" +
        "The checkout must be clean, for example: git -C ~/codex worktree add /tmp/codex-main origin/main",
    );
    return 2;
  }
  const model = readProduct(resolve(opts.product));
  const fresh = renderPage(model);
  if (opts.check) {
    const committed = existsSync(opts.out) ? readFileSync(opts.out, "utf8") : "";
    const problems = diffPages(committed, fresh);
    if (problems.length) {
      console.error(`tools:check failed against Codex ${model.commit}. Run pnpm tools:gen <product> and commit the page.`);
      for (const p of problems) console.error(`  ${p}`);
      return 1;
    }
    console.log(`tools:check: ${model.tools.length} tools, ${model.prompts.length} prompts and ${model.resources.length} resources match Codex ${model.commit}.`);
    return 0;
  }
  writeFileSync(opts.out, fresh);
  console.log(`Wrote ${opts.out}: ${model.tools.length} tools, ${model.prompts.length} prompts, ${model.resources.length} resources from Codex ${model.commit}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(run(process.argv.slice(2)));
  } catch (e) {
    console.error(`gen-tools: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
