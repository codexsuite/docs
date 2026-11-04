/**
 * Page map: one record per public page. Contract 1.
 * Every page exists at src/content/docs/<slug>.mdx. The page's owner replaces the
 * body and keeps the slug and title. Frozen after wave 0.
 *
 * key:   the slug with slashes replaced by dashes ("home" for the home page).
 * slug:  path under src/content/docs, without extension ("index" for the home page).
 * order: position inside the group, from 1.
 */
export type GroupId =
  | "home"
  | "start"
  | "guides"
  | "ui"
  | "agents"
  | "work"
  | "reference";

export interface PageEntry {
  key: string;
  slug: string;
  title: string;
  description: string;
  group: GroupId;
  order: number;
}

export const groupLabels: Record<GroupId, string> = {
  home: "Home",
  start: "Get started",
  guides: "Guides",
  ui: "Using the app",
  agents: "Agents and MCP",
  work: "Working with Codex",
  reference: "Reference",
};

function page(
  group: GroupId,
  order: number,
  slug: string,
  title: string,
  description: string,
): PageEntry {
  const key = slug === "index" ? "home" : slug.replace(/\/+$/g, "").replace(/\//g, "-");
  return { key, slug, title, description, group, order };
}

export const pages: PageEntry[] = [
  page("home", 1, "index", "Codex documentation", "Install Codex, learn every screen, connect agents and take a book from idea to print."),

  page("start", 1, "start/overview", "What is Codex", "The six workspaces and how series, books, chapters and scenes fit together."),
  page("start", 2, "start/requirements", "Requirements", "What a host needs to run Codex, including the kernel feature that printing depends on."),
  page("start", 3, "start/quickstart", "Quick start: Docker Compose", "Run Codex with Docker Compose and sign in as the first admin."),
  page("start", 4, "start/production", "Install for production", "TLS, backups, upgrades and sizing for a Codex install."),
  page("start", 5, "start/configuration", "Configuration reference", "Every operator-facing CODEX_ variable, grouped, with defaults."),
  page("start", 6, "start/worker", "Files and the worker", "What the worker does and why it shares volumes with the app."),
  page("start", 7, "start/sign-in", "Users and sign-in", "Email and password sign-in, the first admin, adding users and one-time passwords."),
  page("start", 8, "start/ai", "AI providers", "Provider kinds, how keys are stored, base URL rules and local endpoints."),
  page("start", 9, "start/observability", "Logs and monitoring", "Turn on Seq, traces and metrics."),
  page("start", 10, "start/troubleshooting", "Troubleshooting", "Fixes for failed sign-in, PDF errors on old kernels, worker jobs left unclaimed and 401s on /mcp."),

  page("guides", 1, "start/guides/first-book", "Your first book in 10 minutes", "Create a book, add an act, chapters and scenes, and write a scene."),
  page("guides", 2, "start/guides/import", "Import a manuscript", "Bring in a manuscript from the Markdown list or Pandoc book folder format."),
  page("guides", 3, "start/guides/clear-a-quote", "Clear a quote for print", "Cite a source, check the word count, draft a permission letter and record the answer."),
  page("guides", 4, "start/guides/export-pdf", "Export a print-ready PDF", "Pick a template, proof, fix preflight warnings and export with bleed and crop marks."),
  page("guides", 5, "start/guides/back-up", "Export and back up a book", "Export a manuscript and make a backup you can restore."),
  page("guides", 6, "start/guides/first-agent", "Connect Claude Code", "Create a token, add the server and ask for a book's outline."),

  page("ui", 1, "ui/navigation", "Navigating Codex", "The book workspace, moving between screens, deep links, themes and search."),
  page("ui", 2, "ui/account", "Sign in and your account", "Sign in, change your password and manage agent access tokens."),
  page("ui", 3, "ui/ai-settings", "AI settings", "Prompt templates, models and provider keys for your account."),
  page("ui", 4, "ui/library", "Library", "The shelf of books, search, new book and import."),
  page("ui", 5, "ui/series", "Series", "Shared style guide and settings that a book uses unless it sets its own."),
  page("ui", 6, "ui/plan", "Plan", "The board and outline: move, split, merge and archive chapters and scenes."),
  page("ui", 7, "ui/write", "Write", "The editor: mentions, focus mode, find and replace, version history."),
  page("ui", 8, "ui/ai-drafts", "Beats and AI drafts", "Draft a scene from a beat and review the result."),
  page("ui", 9, "ui/knowledge-base", "Knowledge base", "Entries, aliases, categories, where an entry is used and the timeline."),
  page("ui", 10, "ui/references", "References", "Sources, uses, quote word counts, permission letters and the bibliography."),
  page("ui", 11, "ui/layout", "Layout", "Live preview, proofs, preflight and export."),
  page("ui", 12, "ui/templates", "Print templates", "The templates a book can use for print."),
  page("ui", 13, "ui/book-settings", "Book settings", "Every settings section, manuscript export, backup, restore and archive."),
  page("ui", 14, "ui/sharing", "Sharing a book", "Roles and what each role can do."),
  page("ui", 15, "ui/users", "User management", "Add and manage users. Admins only."),

  page("agents", 1, "agents/overview", "Agents in Codex", "An agent acts as a person, with that person's access."),
  page("agents", 2, "agents/connect", "Connect an agent", "Create a token and add the Codex MCP server to your client."),
  page("agents", 3, "agents/tokens", "Tokens and scopes", "Scopes, roles, expiry and revoking."),
  page("agents", 4, "agents/tools", "Tool reference", "Every MCP tool, prompt and resource, generated from the server."),
  page("agents", 5, "agents/prompts", "Example prompts", "Prompts to paste into an agent connected to Codex over MCP."),

  page("work", 1, "work/flow", "The flow at a glance", "From series and book to print, in one diagram."),
  page("work", 2, "work/structure", "Planning the structure", "Acts, chapters, scenes, summaries and labels."),
  page("work", 3, "work/research", "Research beside the draft", "Build the knowledge base and link sources into the text."),
  page("work", 4, "work/drafting", "Drafting", "Write by hand and with beats, revise and restore."),
  page("work", 5, "work/clearing", "Clearing quotes and citing", "From a cited quote to a permission on file."),
  page("work", 6, "work/print", "Getting to print", "Templates, proofs, preflight and the final export."),
  page("work", 7, "work/series", "Writing a series", "Shared style and settings across books."),
  page("work", 8, "work/agents", "Writing with an agent", "Which steps an agent can do over MCP and what you keep."),

  page("reference", 1, "reference/glossary", "Glossary", "The terms Codex uses."),
  page("reference", 2, "reference/keyboard", "Keyboard shortcuts", "Every Codex shortcut, listed by screen."),
  page("reference", 3, "reference/prose-format", "Prose format", "The text format the editor and importers use."),
  page("reference", 4, "reference/releases", "Release notes", "Notable changes on the product's main branch."),
];

/** Public URL path of a page: root-relative with a trailing slash. */
export function pagePath(p: PageEntry): string {
  return p.slug === "index" ? "/" : `/${p.slug}/`;
}
