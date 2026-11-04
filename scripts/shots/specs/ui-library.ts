import type { Page } from "playwright";
import type { ShotSpec } from "../types.ts";

/** Adds a standalone book through the API and reloads the Library. The seed has none, and the runner restores the snapshot after the shot. */
async function addStandaloneBook(page: Page, title: string): Promise<string> {
  const response = await page.request.post("/api/books", { data: { title } });
  if (!response.ok()) throw new Error(`POST /api/books answered ${response.status()}.`);
  const body = (await response.json()) as { id: string };
  await page.reload();
  await page.getByTestId("library-new-book").waitFor();
  return body.id;
}

/** Library screen: the shelf, search, filters, list view, New book, New series and Import. */
export const shots: ShotSpec[] = [
  {
    name: "ui-library-overview",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("library-new-book").waitFor();
      await page.getByTestId("library-stack-group").first().waitFor();
    },
  },
  {
    name: "ui-library-search",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("library-new-book").waitFor();
      await page.getByTestId("shell-search-box").fill("tide");
      await page.getByTestId("library-cover").first().waitFor();
      await page.waitForURL(/[?&]q=tide/);
    },
  },
  {
    name: "ui-library-list",
    route: "/?view=list",
    steps: async (page, ctx) => {
      await page.getByTestId("library-group-row").first().waitFor();
      // Open a book from its row, then come back with Back to show the list again.
      await page.getByTestId(`shell-list-row-${ctx.bookIds.tideTables}`).click();
      await page.waitForURL(/\/books\/[^/]+\/(plan|write|references|layout|settings)$/);
      await page.goBack();
      await page.getByTestId("library-group-row").first().waitFor();
      await page.mouse.move(0, 0);
    },
  },
  {
    name: "ui-library-shared-viewer",
    route: "/?view=list&group=none#filter=shared",
    as: "viewer",
    steps: async (page, ctx) => {
      const book = page.getByTestId(`shell-list-row-${ctx.bookIds.saltAndSignal}`);
      await book.getByTestId("library-owner-cell").waitFor();
      await book.getByTestId("library-role-chip").filter({ hasText: "View only" }).waitFor();
    },
  },
  {
    name: "ui-library-palette",
    route: "/",
    steps: async (page, ctx) => {
      // Journey 14: from another book's screen, jump to Tide Tables with Ctrl+K and Enter, then reopen the palette on the Library.
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/references`);
      await page.getByTestId("shell-book-bar").waitFor();
      await page.keyboard.press("Control+k");
      await page.getByTestId("library-palette-input").fill("tide");
      await page.getByTestId(`library-palette-book-${ctx.bookIds.tideTables}`).waitFor();
      await page.keyboard.press("Enter");
      await page.waitForURL(new RegExp(`/books/${ctx.bookIds.tideTables}/`));
      await page.goto("/");
      await page.getByTestId("library-new-book").waitFor();
      await page.keyboard.press("Control+k");
      await page.getByTestId("library-palette-input").fill("tide");
      await page.getByTestId(`library-palette-book-${ctx.bookIds.tideTables}`).waitFor();
    },
  },
  {
    name: "ui-library-new-book",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("library-new-book").click();
      await page.getByTestId("library-new-book-dialog").waitFor();
      await page.getByTestId("library-new-book-title").fill("Lamp Room Notes");
    },
  },
  {
    name: "ui-library-new-book-series",
    route: "/",
    steps: async (page, ctx) => {
      await page.getByTestId("library-new-book").click();
      await page.getByTestId("library-new-book-dialog").waitFor();
      await page.getByTestId("library-new-book-title").fill("Lamp Room Notes");
      await page.getByTestId("library-new-book-series").selectOption(ctx.seriesId);
      await page.getByTestId("library-new-book-number").waitFor();
      await page.waitForFunction(() => (document.querySelector('[data-testid="library-new-book-number"]') as HTMLInputElement | null)?.value !== "");
    },
  },
  {
    name: "ui-library-new-series",
    route: "/",
    steps: async (page) => {
      const bookId = await addStandaloneBook(page, "Lamp Room Notes");
      await page.getByTestId("library-new-series").click();
      await page.getByTestId("library-new-series-dialog").waitFor();
      await page.getByTestId("library-series-name-field").fill("Harbour Lights");
      await page.getByTestId(`library-new-series-book-${bookId}`).check();
      await page.getByTestId("library-new-series-picked").waitFor();
    },
  },
  {
    name: "ui-library-series-created",
    route: "/",
    steps: async (page, ctx) => {
      // Journey 27, step 1: create two standalone books, gather them into a series and open it.
      const first = await addStandaloneBook(page, "Lamp Room Notes");
      const second = await addStandaloneBook(page, "Fog Signal Log");
      await page.getByTestId("library-new-series").click();
      await page.getByTestId("library-new-series-dialog").waitFor();
      await page.getByTestId("library-series-name-field").fill("Harbour Lights");
      await page.getByTestId(`library-new-series-book-${first}`).check();
      await page.getByTestId(`library-new-series-book-${second}`).check();
      await page.getByTestId("library-new-series-create").click();
      await page.getByTestId("library-new-series-dialog").waitFor({ state: "hidden" });
      const newStack = page.locator(`[data-testid^="shell-series-stack-"]:not([data-testid="shell-series-stack-${ctx.seriesId}"])`);
      await newStack.waitFor();
      await newStack.click();
      await page.getByTestId("library-series-stats").waitFor();
    },
  },
  {
    name: "ui-library-import",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("library-import").click();
      await page.getByTestId("library-import-dialog").waitFor();
      await page.getByTestId("library-import-picker").waitFor();
    },
  },
  {
    name: "ui-library-import-preview",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("library-import").click();
      await page.getByTestId("library-import-dialog").waitFor();
      await page.getByTestId("library-import-source-pandoc").click();
      // The folder input takes only a directory path, so build the files in the page and fire the change event.
      const chapters = [
        { name: "Chapter 1.md", text: "# The Lamp Room\n\nOrla climbed the stair with the oil can and counted the steps.\n" },
        { name: "Chapter 2.md", text: "# Low Water\n\nThe tide went out past the last marker, and Orla wrote it in the log.\n" },
      ];
      await page.getByTestId("library-import-file").evaluate((input: HTMLInputElement, files) => {
        const transfer = new DataTransfer();
        for (const file of files) transfer.items.add(new File([file.text], file.name, { type: "text/markdown" }));
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, chapters);
      await page.getByTestId("library-import-file-name").waitFor();
      await page.getByTestId("library-import-next").click();
      await page.getByTestId("import-preview").waitFor();
    },
  },
];
