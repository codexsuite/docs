import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Book settings of Salt and Signal, one shot per section, then the lifecycle journeys. */

const base = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/settings`;
const at = (section: string) => (ctx: SeedResult) => `${base(ctx)}#${section}`;
const longWait = { timeout: 150_000 };

async function card(page: Page, section: string): Promise<void> {
  await page.getByTestId(`settings-section-${section}`).waitFor();
  await page.getByTestId(`settings-section-${section}`).scrollIntoViewIfNeeded();
}

async function waitFor(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).first().waitFor();
}

/** Dismisses every message so a shot shows only the message of its own step. */
async function clearToasts(page: Page): Promise<void> {
  const dismiss = page.getByTestId("editing-toast-dismiss");
  while (await dismiss.count()) await dismiss.first().click();
}

async function saved(page: Page): Promise<void> {
  await page.locator("[data-testid='editing-save-status'][data-state='saved']").waitFor();
}

/** Opens the Archive card and clicks Archive, then waits for the dialog. */
async function openArchiveDialog(page: Page): Promise<void> {
  await card(page, "archive");
  await page.getByTestId("settings-archive").click();
  await waitFor(page, "settings-archive-dialog");
}

async function archiveBook(page: Page): Promise<void> {
  await openArchiveDialog(page);
  await page.getByTestId("settings-archive-confirm").click();
  await waitFor(page, "settings-archived-bar");
  await page.getByTestId("settings-archived-bar").scrollIntoViewIfNeeded();
}

/** Archives the book, then opens the permanent delete dialog from its row in the Library and types the title. */
async function openDeleteDialog(page: Page, ctx: SeedResult): Promise<void> {
  await archiveBook(page);
  const id = ctx.bookIds.saltAndSignal;
  await page.goto("/?status=archived");
  await page.getByTestId(`library-book-menu-${id}`).click();
  await page.getByTestId(`library-delete-book-${id}`).click();
  await waitFor(page, "library-delete-book-impact");
  await page.getByTestId("library-delete-book-title").fill("Salt and Signal");
}

export const shots: ShotSpec[] = [
  { name: "ui-book-settings-overview", route: base, steps: (page) => card(page, "book") },
  {
    name: "ui-book-settings-writing",
    route: at("writing"),
    steps: async (page) => {
      await card(page, "writing");
      const editor = page.getByTestId("settings-style-guide").locator("[contenteditable='true']").first();
      await editor.click();
      await page.keyboard.type("Plain words. Past tense. British spelling. Name Edith Marrow in full on first mention.");
      await page.getByTestId("settings-style-guide-words").waitFor();
      await page.getByTestId("settings-title").focus();
      await saved(page);
      await card(page, "writing");
    },
  },
  { name: "ui-book-settings-citations", route: at("citations"), steps: (page) => card(page, "citations") },
  {
    name: "ui-book-settings-rules",
    route: at("rules"),
    steps: async (page) => {
      await waitFor(page, "settings-impact");
      await page.getByTestId("settings-quote-limit").fill("400");
      await page.getByTestId("settings-quote-limit").blur();
      await page.locator("[data-testid='settings-impact'][data-limit='400']").waitFor();
      await waitFor(page, "settings-quote-limit-reset");
      await saved(page);
    },
  },
  {
    name: "ui-book-settings-letters",
    route: at("letters"),
    steps: async (page) => {
      // Letters has no card of its own: it sits inside Citations & permissions.
      await waitFor(page, "settings-publisher");
      await page.getByTestId("settings-letter").scrollIntoViewIfNeeded();
    },
  },
  { name: "ui-book-settings-layout", route: at("layout"), steps: (page) => card(page, "layout") },
  {
    name: "ui-book-settings-publish",
    route: base,
    steps: async (page) => {
      await card(page, "book");
      await page.getByTestId("settings-status-published").click();
      await waitFor(page, "settings-publish-dialog");
      await waitFor(page, "settings-publish-warning");
    },
  },
  {
    name: "ui-book-settings-published",
    route: at("archive"),
    mask: ["[data-testid='settings-section-archive']", "[data-testid='settings-section-book']"],
    steps: async (page) => {
      await card(page, "book");
      await page.getByTestId("settings-status-published").click();
      await page.getByTestId("settings-publish-confirm").click();
      await page.getByTestId("settings-publish-dialog").waitFor({ state: "hidden" });
      await card(page, "archive");
      await page.locator("[data-testid^='settings-snapshot-download-']").first().waitFor(longWait);
      await page.getByTestId("settings-snapshots").scrollIntoViewIfNeeded();
      await saved(page);
    },
  },
  {
    name: "ui-book-settings-status-back",
    route: base,
    mask: ["[data-testid='settings-section-archive']"],
    steps: async (page) => {
      await card(page, "book");
      await page.getByTestId("settings-status-published").click();
      await page.getByTestId("settings-publish-confirm").click();
      await page.getByTestId("settings-publish-dialog").waitFor({ state: "hidden" });
      await page.getByTestId("settings-status-revising").click();
      await page.locator("[data-testid='settings-status-revising'][aria-pressed='true']").waitFor();
      await saved(page);
    },
  },
  { name: "ui-book-settings-archive", route: at("archive"), steps: openArchiveDialog },
  {
    name: "ui-book-settings-archived",
    route: at("archive"),
    steps: archiveBook,
  },
  {
    name: "ui-book-settings-restored",
    route: at("archive"),
    steps: async (page) => {
      await archiveBook(page);
      await page.getByTestId("settings-restore").click();
      await page.getByTestId("settings-archived-bar").waitFor({ state: "detached" });
      await page.getByTestId("settings-archive").waitFor();
      await clearToasts(page);
      await card(page, "archive");
    },
  },
  {
    name: "ui-book-settings-delete",
    route: at("archive"),
    steps: async (page, ctx) => openDeleteDialog(page, ctx),
  },
  {
    name: "ui-book-settings-deleted",
    route: at("archive"),
    steps: async (page, ctx) => {
      await openDeleteDialog(page, ctx);
      await page.getByTestId("library-delete-book-confirm").click();
      await page.getByTestId("library-delete-book-dialog").waitFor({ state: "hidden" });
    },
  },
  {
    name: "ui-book-settings-duplicate",
    route: at("archive"),
    steps: async (page) => {
      await card(page, "archive");
      await page.getByTestId("settings-duplicate").click();
      await waitFor(page, "settings-duplicate-dialog");
    },
  },
  {
    name: "ui-book-settings-edition",
    route: at("archive"),
    steps: async (page) => {
      await card(page, "archive");
      await page.getByTestId("settings-new-edition").click();
      await waitFor(page, "settings-duplicate-dialog");
    },
  },
  {
    name: "ui-book-settings-edition-done",
    route: at("archive"),
    steps: async (page) => {
      await card(page, "archive");
      await page.getByTestId("settings-new-edition").click();
      await page.getByTestId("settings-duplicate-confirm").click();
      await waitFor(page, "settings-duplicate-done");
      await page.getByTestId("settings-duplicate-done").scrollIntoViewIfNeeded();
    },
  },
  {
    name: "ui-book-settings-duplicated",
    route: at("archive"),
    steps: async (page) => {
      await card(page, "archive");
      await page.getByTestId("settings-duplicate").click();
      await page.getByTestId("settings-duplicate-confirm").click();
      await waitFor(page, "settings-duplicate-done");
      await page.getByTestId("settings-duplicate-done").scrollIntoViewIfNeeded();
    },
  },
  {
    name: "ui-book-settings-manuscript",
    route: at("archive"),
    steps: async (page) => {
      await card(page, "archive");
      await page.getByTestId("settings-export-manuscript").click();
      await waitFor(page, "settings-manuscript-dialog");
      await waitFor(page, "settings-manuscript-risk");
    },
  },
  {
    name: "ui-book-settings-manuscript-done",
    route: at("archive"),
    mask: ["[data-testid='settings-manuscript-job']"],
    steps: async (page) => {
      await card(page, "archive");
      await page.getByTestId("settings-export-manuscript").click();
      await waitFor(page, "settings-manuscript-risk");
      await page.getByTestId("settings-manuscript-format-markdown").click();
      await page.getByTestId("settings-manuscript-submit").click();
      await waitFor(page, "settings-manuscript-job");
      await page.getByTestId("settings-manuscript-download").waitFor(longWait);
      await page.getByTestId("settings-manuscript-job").evaluate((row) => row.scrollIntoView({ block: "center" }));
    },
  },
  {
    name: "ui-book-settings-backup-done",
    route: at("archive"),
    steps: async (page) => {
      await card(page, "archive");
      await page.getByTestId("settings-export-source").click();
      await page.getByTestId("settings-export-download").waitFor(longWait);
      await waitFor(page, "settings-export-notes");
      await page.getByTestId("settings-export-source").evaluate((button) => button.scrollIntoView({ block: "center" }));
    },
  },
  {
    name: "ui-book-settings-viewer",
    route: base,
    as: "viewer",
    steps: async (page) => {
      await waitFor(page, "settings-read-only-note");
      await page.locator("#settings-title:disabled").waitFor();
    },
  },
];
