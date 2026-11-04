import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Working with Codex: writing a series. Working Coasts holds Salt and Signal and Tide Tables. */

const seriesRoute = (ctx: SeedResult) => `/#series=${ctx.seriesId}`;
const planRoute = (bookId: string) => `/books/${bookId}/plan`;

/** Creates a standalone book through the REST API and returns its id. */
async function createBook(page: Page, title: string): Promise<string> {
  const response = await page.request.post("/api/books", { data: { title } });
  if (!response.ok()) throw new Error(`POST /api/books answered ${response.status()}.`);
  return ((await response.json()) as { id: string }).id;
}

/** Opens Edith Marrow in Salt and Signal and starts Move to series. */
async function startPromote(page: Page, ctx: SeedResult): Promise<void> {
  const entry = ctx.entryIds["Edith Marrow"];
  await page.goto(`${planRoute(ctx.bookIds.saltAndSignal)}#kb=${entry}&entry=${entry}`);
  await page.getByTestId("kb-entry-name").waitFor();
  await page.getByTestId("kb-entry-menu").click();
  await page.getByTestId("kb-entry-menu-promote").click();
  await page.getByTestId("kb-promote-dialog").waitFor();
}

/** Makes two standalone books and fills in the New series dialog for Harbour Walks. */
async function fillNewSeries(page: Page): Promise<void> {
  const first = await createBook(page, "Lamp Room Notes");
  const second = await createBook(page, "Chart House Journal");
  await page.goto("/");
  await page.getByTestId("library-new-series").click();
  await page.getByTestId("library-new-series-dialog").waitFor();
  await page.getByTestId("library-series-name-field").fill("Harbour Walks");
  await page.getByTestId(`library-new-series-book-${first}`).check();
  await page.getByTestId(`library-new-series-book-${second}`).check();
  await page.getByTestId("library-new-series-picked").waitFor();
}

/** Moves Edith Marrow up to the series from Salt and Signal. */
async function promoteEdith(page: Page, ctx: SeedResult): Promise<void> {
  await startPromote(page, ctx);
  await page.getByTestId("kb-promote-confirm").click();
  await page.getByTestId("kb-entry-scope").waitFor();
}

/** Opens the Review move dialog on the settings of a book, with the series list set to a series id or "" for None. */
async function reviewMove(page: Page, bookId: string, seriesId: string): Promise<void> {
  await page.goto(`/books/${bookId}/settings#series`);
  await page.getByTestId("settings-series-select").selectOption(seriesId);
  await page.getByTestId("settings-move-review").click();
  await page.getByTestId("settings-move-dialog").waitFor();
  await page.getByTestId("settings-move-from-to").waitFor();
}

export const shots: ShotSpec[] = [
  {
    name: "work-series-new",
    route: "/",
    steps: fillNewSeries,
  },
  {
    name: "work-series-created",
    route: "/",
    steps: async (page) => {
      await fillNewSeries(page);
      const created = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/series" && r.ok());
      await page.getByTestId("library-new-series-create").click();
      const seriesId = ((await (await created).json()) as { id: string }).id;
      await page.getByTestId("library-new-series-dialog").waitFor({ state: "hidden" });
      await page.getByTestId(`shell-series-stack-${seriesId}`).click();
      await page.getByTestId("library-series-stats").waitFor();
    },
  },
  {
    name: "work-series-overview",
    route: seriesRoute,
    steps: async (page) => {
      await page.getByTestId("library-series-title").waitFor();
      await page.getByTestId("library-series-stats").waitFor();
    },
  },
  {
    name: "work-series-promote",
    route: (ctx) => planRoute(ctx.bookIds.saltAndSignal),
    steps: startPromote,
  },
  {
    name: "work-series-shared-entry",
    route: (ctx) => planRoute(ctx.bookIds.tideTables),
    steps: async (page, ctx) => {
      await promoteEdith(page, ctx);
      const entry = ctx.entryIds["Edith Marrow"];
      await page.goto(`${planRoute(ctx.bookIds.tideTables)}#kb=${entry}&entry=${entry}`);
      await page.getByTestId("kb-entry-scope").waitFor();
      await page.getByTestId(`shell-kb-item-${entry}`).waitFor();
    },
  },
  {
    name: "work-series-reorder",
    route: seriesRoute,
    steps: async (page, ctx) => {
      await page.getByTestId("library-series-settings").click();
      await page.getByTestId("library-series-dialog").waitFor();
      await page.getByTestId(`library-series-move-up-${ctx.bookIds.tideTables}`).click();
      await page.getByTestId("library-series-order").waitFor();
    },
  },
  {
    name: "work-series-reordered",
    route: seriesRoute,
    steps: async (page, ctx) => {
      await page.getByTestId("library-series-settings").click();
      await page.getByTestId("library-series-dialog").waitFor();
      await page.getByTestId(`library-series-move-up-${ctx.bookIds.tideTables}`).click();
      await page.getByTestId("library-series-save").click();
      await page.getByTestId("library-series-dialog").waitFor({ state: "hidden" });
      await page.getByTestId("library-series-stats").waitFor();
    },
  },
  {
    name: "work-series-edited",
    route: (ctx) => planRoute(ctx.bookIds.tideTables),
    steps: async (page, ctx) => {
      await promoteEdith(page, ctx);
      const entry = ctx.entryIds["Edith Marrow"];
      const hash = `#kb=${entry}&entry=${entry}`;
      const summary = "Head keeper at Harrowmouth for thirty-one years.";
      await page.goto(`${planRoute(ctx.bookIds.tideTables)}${hash}`);
      await page.getByTestId("kb-entry-summary").waitFor();
      const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.ok());
      await page.getByTestId("kb-entry-summary").fill(summary);
      await page.getByTestId("kb-entry-name").focus();
      await saved;
      await page.goto(`${planRoute(ctx.bookIds.saltAndSignal)}${hash}`);
      await page.getByTestId(`shell-kb-item-${entry}`).waitFor();
      await page.waitForFunction(
        (expected) => (document.querySelector('[data-testid="kb-entry-summary"]') as HTMLTextAreaElement | null)?.value === expected,
        summary,
      );
    },
  },
  {
    name: "work-series-take-out",
    route: "/",
    steps: async (page, ctx) => {
      // Salt and Signal is first, so the dialog has a renumber line for Tide Tables.
      await reviewMove(page, ctx.bookIds.saltAndSignal, "");
    },
  },
  {
    name: "work-series-left",
    route: "/",
    steps: async (page, ctx) => {
      await reviewMove(page, ctx.bookIds.saltAndSignal, "");
      await page.getByTestId("settings-move-confirm").click();
      await page.getByTestId("settings-move-dialog").waitFor({ state: "hidden" });
      await page.goto(`/#series=${ctx.seriesId}`);
      await page.getByTestId("library-series-stats").waitFor();
      await page.getByTestId(`shell-tile-${ctx.bookIds.tideTables}`).waitFor();
    },
  },
  {
    name: "work-series-joined",
    route: "/",
    steps: async (page, ctx) => {
      const bookId = await createBook(page, "Lamp Room Notes");
      await reviewMove(page, bookId, ctx.seriesId);
      await page.getByTestId("settings-move-confirm").click();
      await page.getByTestId("settings-move-dialog").waitFor({ state: "hidden" });
      await page.goto(`/#series=${ctx.seriesId}`);
      await page.getByTestId("library-series-stats").waitFor();
      await page.getByTestId(`shell-tile-${bookId}`).waitFor();
    },
  },
];
