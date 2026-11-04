import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { readProduct, renderPage, run } from "./gen-tools.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const files: Record<string, string> = {
  "src/Codex.Application/Mcp/ThingTools.cs": `
namespace Codex.Application.Mcp;
[McpServerToolType]
public sealed class ThingTools(IService s)
{
    // a comment with a "quote
    [McpServerTool(Name = "list_things", Title = "List things", ReadOnly = true, Idempotent = true)]
    [Description("Lists things, filtered by \\"kind\\". " +
                 "Pages of \`limit\` | with {braces}.")]
    public async Task<R> ListAsync(
        McpServer server,
        [Description("Narrow to a kind.")] string? kind = null,
        [Description("Page size.")] int limit = 50,
        CancellationToken cancellationToken = default)
    {
        var url = "https://example.test/x"; // not a tool
        return null;
    }

    [McpServerTool(Name = "make_thing", Title = "Make a thing", Destructive = false)]
    [Description("Makes a thing.")]
    public Task<R> MakeAsync(
        [Description("The name.")] string name,
        [Description("Options.")] Dictionary<string, JsonElement>? options = null) => null;
}`,
  "src/Codex.Application/Mcp/CodexPrompts.cs": `
public sealed class CodexPrompts
{
    [McpServerPrompt(Name = "resume", Title = "Pick up")]
    [Description("A briefing.")]
    public Task<string> ResumeAsync([Description("The book.")] string? book = null) => null;
}`,
  "src/Codex.Application/Mcp/CodexResources.cs": `
public sealed class CodexResources
{
    [McpServerResource(UriTemplate = "codex://things", Name = "Things", MimeType = "application/json")]
    [Description("All things.")]
    public Task<string> ThingsAsync() => null;
}`,
  "src/Codex.Application/Mcp/McpScopes.cs": `
public static class McpScopes
{
    public static readonly IReadOnlyDictionary<string, string> ForTool = new Dictionary<string, string>
    {
        ["list_things"] = ApiTokenScopes.Read,
        ["make_thing"] = ApiTokenScopes.Write,
    };
}`,
  "src/Codex.Application/Mcp/McpErrorCodes.cs": `
public static class McpErrorCodes
{
    public const string NotFound = ApiErrorCodes.NotFound;
    public const string Invalid = "invalid";
    public const string StaleRef = "stale_ref";
}`,
  "src/Codex.Application/Mcp/McpGenerationBudget.cs": `
public sealed class McpGenerationBudget
{
    public const string Setting = "CODEX_MCP_MAX_GENERATIONS";
    public const int DefaultLimit = 20;
}`,
  "src/Codex.Application/Identity/ApiTokenScopes.cs": `
public static class ApiTokenScopes
{
    public const string Read = "codex:read";
    public const string Write = "codex:write";
}`,
  "src/Codex.Contracts/Errors/ApiErrorCodes.cs": `
public static class ApiErrorCodes
{
    public const string NotFound = "not_found";
}`,
  "docs/mcp.md": `# MCP

## Tools (phase 1: read only)

| Tool | What it does |
|---|---|
| \`list_things\` | Lists. |

## Tools (phase 2: writes)

| Tool | What it does |
|---|---|
| \`make_thing\` | Makes. |

## Errors

| Code | When | Extra fields |
|---|---|---|
| \`not_found\` | No match | \`candidates\` |
| \`invalid\` | Bad argument | \`field\` |
| \`stale_ref\` | Number moved | |
`,
};

let dir: string;

function writeProduct(overrides: Record<string, string | null> = {}): string {
  const product = join(dir, "product");
  for (const [path, text] of Object.entries({ ...files, ...overrides })) {
    if (text === null) continue;
    mkdirSync(dirname(join(product, path)), { recursive: true });
    writeFileSync(join(product, path), text);
  }
  return product;
}

function quietly<T>(fn: () => T): { result: T; stderr: string; stdout: string } {
  const err = console.error;
  const log = console.log;
  let stderr = "";
  let stdout = "";
  console.error = (...a: unknown[]) => void (stderr += a.join(" ") + "\n");
  console.log = (...a: unknown[]) => void (stdout += a.join(" ") + "\n");
  try {
    return { result: fn(), stderr, stdout };
  } finally {
    console.error = err;
    console.log = log;
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gen-tools-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("GeneratedPageListsEveryTool", () => {
  const model = readProduct(writeProduct());
  const page = renderPage(model);
  assert.deepEqual(model.tools.map((t) => t.name).sort(), ["list_things", "make_thing"]);
  for (const t of model.tools) assert.ok(page.includes(`| \`${t.name}\``), `${t.name} is on the page`);
  assert.ok(page.includes("| `resume`") && page.includes("| `codex://things`"));
  const list = model.tools.find((t) => t.name === "list_things")!;
  assert.equal(list.description, 'Lists things, filtered by "kind". Pages of `limit` | with {braces}.');
  assert.deepEqual(list.params.map((p) => [p.name, p.required]), [["kind", false], ["limit", false]]);
  assert.deepEqual(model.tools.find((t) => t.name === "make_thing")!.params.map((p) => [p.name, p.required]), [["name", true], ["options", false]]);
  assert.match(page, /with \\\{braces\\\}/);
  assert.match(page, /`limit` \\\| with/);
});

test("GeneratedPageListsEveryTool: the committed page lists 48 tools", () => {
  const page = readFileSync(join(repoRoot, "src/content/docs/agents/tools.mdx"), "utf8");
  const tools = page.slice(page.indexOf("\n## Tools"), page.indexOf("\n## Prompts"));
  assert.equal(tools.split("\n").filter((l) => l.startsWith("| `")).length, 48);
});

test("GeneratedPageListsEveryTool: a tool added to the product is found", () => {
  const extra = files["src/Codex.Application/Mcp/ThingTools.cs"]!.replace(
    "public Task<R> MakeAsync",
    `public Task<R> MakeAsync`,
  );
  const product = writeProduct({
    "src/Codex.Application/Mcp/ThingTools.cs": extra + `\n[McpServerTool(Name = "drop_thing")]\n[Description("Drops.")]\npublic Task<R> DropAsync() => null;`,
    "src/Codex.Application/Mcp/McpScopes.cs": files["src/Codex.Application/Mcp/McpScopes.cs"]!.replace(
      "};",
      '["drop_thing"] = ApiTokenScopes.Write,\n};',
    ),
  });
  const model = readProduct(product);
  assert.equal(model.tools.length, 3);
  assert.equal(model.tools.find((t) => t.name === "drop_thing")!.group, "Other tools");
});

test("ErrorTableCoversEveryCode", () => {
  const model = readProduct(writeProduct());
  const page = renderPage(model);
  for (const code of ["not_found", "invalid", "stale_ref"]) assert.ok(page.includes(`\`${code}\``), code);
  const noRow = files["docs/mcp.md"]!.replace("| `stale_ref` | Number moved | |\n", "");
  assert.throws(() => readProduct(writeProduct({ "docs/mcp.md": noRow })), /stale_ref has no row/);
});

test("ErrorTableCoversEveryCode: the committed page has every code in the product list", () => {
  const page = readFileSync(join(repoRoot, "src/content/docs/agents/tools.mdx"), "utf8");
  const errors = page.slice(page.indexOf("\n## Errors"));
  for (const code of [
    "not_found", "ambiguous", "conflict", "out_of_scope", "blocked", "needs_confirmation", "not_configured",
    "internal_error", "invalid", "rate_limited", "forbidden", "unauthorized", "stale_ref",
  ]) {
    assert.ok(errors.includes(`\`${code}\``), `${code} is in the error table`);
  }
});

test("ToolsCheckFailsWhenToolMissing", () => {
  const product = writeProduct();
  const out = join(dir, "tools.mdx");
  assert.equal(quietly(() => run([product, "--out", out])).result, 0);
  assert.equal(quietly(() => run([product, "--check", "--out", out])).result, 0);

  const without = readFileSync(out, "utf8").split("\n").filter((l) => !l.startsWith("| `make_thing`")).join("\n");
  writeFileSync(out, without);
  const missing = quietly(() => run([product, "--check", "--out", out]));
  assert.equal(missing.result, 1);
  assert.match(missing.stderr, /`make_thing` is missing from the page/);

  const changed = readFileSync(out, "utf8").replace("Lists things", "Lists stuff");
  writeFileSync(out, changed.replace(/^.*make_thing.*\n/m, "") + "\n");
  const stale = quietly(() => run([product, "--check", "--out", out]));
  assert.equal(stale.result, 1);
  assert.match(stale.stderr, /`list_things` has changed/);
});

test("ToolsCheckFailsWhenToolMissing: a tool the server dropped is named", () => {
  const out = join(dir, "tools.mdx");
  quietly(() => run([writeProduct(), "--out", out]));
  const dropped = writeProduct({
    "src/Codex.Application/Mcp/McpScopes.cs": files["src/Codex.Application/Mcp/McpScopes.cs"]!.replace('["make_thing"] = ApiTokenScopes.Write,', ""),
    "src/Codex.Application/Mcp/ThingTools.cs": files["src/Codex.Application/Mcp/ThingTools.cs"]!.replace(/\[McpServerTool\(Name = "make_thing"[\s\S]*$/, "}"),
  });
  const r = quietly(() => run([dropped, "--check", "--out", out]));
  assert.equal(r.result, 1);
  assert.match(r.stderr, /`make_thing` is on the page but not in the server/);
});

test("GeneratorRequiresProductArgument", () => {
  const r = quietly(() => run([]));
  assert.equal(r.result, 2);
  assert.match(r.stderr, /pass the product checkout/);
  assert.throws(() => readProduct(join(dir, "nothing")), /is not in/);
});
