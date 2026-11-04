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
  let verbatim = false;
  while (s[j] === "$" || s[j] === "@") {
    if (s[j] === "@") verbatim = true;
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
  /** The name of the tool that replaces this one at /mcp, when the tool is not offered there. */
  notAtMcp?: string;
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

/**
 * What each error code means to a reader of /mcp. Written for this page and traced to the product code, not copied from
 * docs/mcp.md, which is a developer document. readProduct throws for any code the server can return that has no row here.
 */
const errorRows: ErrorRow[] = [
  {
    codes: ["not_found"],
    when: "No match for a ref, including a display number too big for any outline, or a book the token's user can neither own nor open through sharing.",
    extra: "`candidates`: close matches",
  },
  {
    codes: ["ambiguous"],
    when: "A ref matches more than one thing, such as a book you own and a book shared with you that have the same title, or a name two entries share.",
    extra: "`candidates`. A book or series candidate names its `owner`, with `id` and `display_name`.",
  },
  {
    codes: ["out_of_scope"],
    when: "The entry exists, but not in the book's scope, which is the book and its series.",
    extra: "`candidates`: the entries found. `scope`: the book and series checked.",
  },
  {
    codes: ["stale_ref"],
    when: "The server does not return this code at `/mcp`, because it keeps no session between calls. A display number such as `5.2` always means what it names at the time of the call. If the outline can change between calls, pass ids.",
    extra: "None",
  },
  {
    codes: ["invalid"],
    when: "A bad argument: a wrong type, a missing required argument, or an unknown tool name. A call to a tool that `/mcp` does not offer also fails this way.",
    extra: "`field`",
  },
  {
    codes: ["conflict"],
    when: "The `expected_version` is out of date, or an undo comes after the prose has changed again.",
    extra: "`candidates`: the scene",
  },
  {
    codes: ["blocked"],
    when: "An undo that cannot run because it is already done (`already_undone`), expired (`undo_expired`) or not supported yet (`undo_unsupported`). Also a change only the author can make in the app (`author_decision`).",
    extra: "`rule`. `open_url` when the author has to act in the app.",
  },
  {
    codes: ["needs_confirmation"],
    when: "Moving a book into or between series copies the Knowledge base of the series it leaves, and an undo cannot reverse that. Nothing is written until the call is repeated with `confirm` set to true.",
    extra: "None",
  },
  {
    codes: ["not_configured"],
    when: "The server lacks a setting the tool needs. The message names it, for example `CODEX_BLOB_ROOT` for images and permission letters.",
    extra: "None",
  },
  {
    codes: ["rate_limited"],
    when: "The token has started its limit of `draft_prose` calls in the last hour. See Limits above.",
    extra: "None",
  },
  {
    codes: ["forbidden"],
    when: "The token lacks the scope the tool needs, or the token's user has a role on the book below what the call needs. A view-only role fails every write.",
    extra: "`field`: the scope it needs. Nothing for a role.",
  },
  {
    codes: ["unauthorized"],
    when: "A missing, unknown, revoked or expired token, or one whose user is disabled. At `/mcp` this is an HTTP 401 with `WWW-Authenticate: Bearer realm=\"codex\"`, not a tool error.",
    extra: "None",
  },
  {
    codes: ["internal_error"],
    when: "A server fault. The message is fixed, and the details go to the server log.",
    extra: "None",
  },
];

/**
 * McpTransportTools.Filter leaves one tool out of tools/list on each transport. Returns the tool that /mcp (HTTP) leaves
 * out, mapped to the one it offers instead.
 */
function readNotAtMcp(product: string): Map<string, string> {
  const src = read(product, `${mcpDir}/McpTransportTools.cs`);
  const m = /var hidden = IsStdio\([^)]*\)\s*\?\s*ImageTools\.(\w+)\s*:\s*ImageTools\.(\w+);/.exec(src);
  if (!m) throw new Error(`Cannot read which tool each transport hides from ${mcpDir}/McpTransportTools.cs`);
  const images = read(product, `${mcpDir}/ImageTools.cs`);
  const name = (id: string): string => {
    const v = new RegExp(`const string ${id}\\s*=\\s*"(\\w+)"`).exec(images)?.[1];
    if (!v) throw new Error(`Cannot read ImageTools.${id}`);
    return v;
  };
  return new Map([[name(m[2]!), name(m[1]!)]]);
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

  const notAtMcp = readNotAtMcp(product);
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
        notAtMcp: notAtMcp.get(name),
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

  // Every code the server can return needs a row in errorRows.
  const apiCodes = constants(read(product, apiErrorCodesFile));
  const errorConsts = constants(read(product, errorCodesFile));
  const codes: string[] = [];
  for (const [, value] of errorConsts) {
    const code = resolveLiteral(value, apiCodes);
    // McpErrorCodes.FromApiCode turns "validation" into "invalid".
    codes.push(code === "validation" ? "invalid" : code);
  }
  for (const code of new Set(codes)) {
    if (!errorRows.some((e) => e.codes.includes(code))) throw new Error(`Error code ${code} has no row in errorRows in scripts/gen-tools.ts`);
  }
  // A row for a code the server no longer has drops off the page.
  const errors = errorRows.filter((e) => e.codes.every((c) => codes.includes(c)));

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
    `Codex serves its tools, prompts and resources at \`/mcp\`. This page lists all of them. It is generated from the server's own definitions, so the names and descriptions are the ones your agent sees.`,
    "",
    `The server defines ${m.tools.length} tools, ${m.prompts.length} prompts and ${m.resources.length} resources.${m.tools.filter((t) => t.notAtMcp).map((t) => ` The tool \`${t.name}\` is not offered at \`/mcp\`, so an agent sees ${m.tools.length - m.tools.filter((x) => x.notAtMcp).length} tools.`).join("")} To connect an agent, see [Connect an agent](/agents/connect/). To create a token with the scopes you need, see [Tokens and scopes](/agents/tokens/).`,
    "",
    "## Scopes",
    "",
    "Every token holds `codex:read`. A tool called without its scope fails with `forbidden`, and the message names the scope.",
    "",
    "A call also needs a high enough role on the book it touches. A token with `codex:write` on a book shared to you for viewing fails with `forbidden`.",
    "",
    "`undo` also needs the scope of the tool whose write it reverses. Signing off a source and accepting fair use stay in the app, whatever scopes a token has.",
    "",
    table(["Scope", "Tools"], m.scopes.map((s) => [`\`${s.scope}\``, s.tools.map((t) => `\`${t}\``).join(", ")])),
    "",
    "## Tools",
    "",
    "A tool marked read only never changes anything.",
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
          cell(t.description) + (t.notAtMcp ? `<br />Not offered at \`/mcp\`. Use \`${t.notAtMcp}\`.` : ""),
          paramCell(t.params),
        ]),
      ),
      "",
    );
  }
  out.push(
    "## Prompts",
    "",
    "Prompts appear in an agent as commands. They only read, so they need `codex:read`. Codex checks each write against the token when the agent calls the tool.",
    "",
    table(
      ["Prompt", "What it does", "Arguments"],
      m.prompts.map((p) => [`\`${p.name}\`<br />${cell(p.title)}`, cell(p.description), paramCell(p.params)]),
    ),
    "",
    "## Resources",
    "",
    "Resources are read-only context an agent can pin. They need `codex:read`.",
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
      [[`\`${m.limit.setting}\``, m.limit.defaultValue, "A token can start this many `draft_prose` calls in any hour. The next call fails with `rate_limited`."]],
    ),
    "",
    "## Errors",
    "",
    'A failed call returns a tool error. Its text is JSON with `ok` set to false and an `error` object that holds `code`, `message` and, for some errors, the extra fields below. A resource or prompt that fails is a protocol error whose message is "code: message". The rows are written for this page and checked against the list of codes in the server.',
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
