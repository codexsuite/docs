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

export const shots: ShotSpec[] = [
  {
    name: "work-series-new",
    route: "/",
    steps: async (page) => {
      const first = await createBook(page, "Lamp Room Notes");
      const second = await createBook(page, "Chart House Journal");
      await page.goto("/");
      await page.getByTestId("library-new-series").click();
      await page.getByTestId("library-new-series-dialog").waitFor();
      await page.getByTestId("library-series-name-field").fill("Harbour Walks");
      await page.getByTestId(`library-new-series-book-${first}`).check();
      await page.getByTestId(`library-new-series-book-${second}`).check();
      await page.getByTestId("library-new-series-picked").waitFor();
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
      await startPromote(page, ctx);
      await page.getByTestId("kb-promote-confirm").click();
      await page.getByTestId("kb-entry-scope").waitFor();
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
];
