import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId("library-series-settings").click();
  await page.getByTestId("library-series-dialog").waitFor();
}

/** Series screen: totals, book order, settings and deleting a series. */
export const shots: ShotSpec[] = [
  {
    name: "ui-series-overview",
    route: "/",
    steps: async (page, ctx) => {
      // Journey 2: Library, the series stack, a book on its Plan, and Back to the series.
      await page.getByTestId(`shell-series-stack-${ctx.seriesId}`).click();
      await page.getByTestId("library-series-title").waitFor();
      await page.getByTestId(`shell-tile-${ctx.bookIds.tideTables}`).click();
      await page.waitForURL(/\/books\/[^/]+\/plan$/);
      await page.getByTestId("shell-back-link").click();
      await page.getByTestId("library-series-title").waitFor();
      await page.getByTestId("library-series-stats").waitFor();
    },
  },
  {
    name: "ui-series-settings",
    route: (ctx: SeedResult) => `/#series=${ctx.seriesId}`,
    steps: async (page) => {
      await openSettings(page);
      await page.getByTestId("library-series-order").waitFor();
    },
  },
  {
    name: "ui-series-reordered",
    route: (ctx: SeedResult) => `/#series=${ctx.seriesId}`,
    steps: async (page, ctx) => {
      // Move the second book up and save. Both books swap numbers.
      await openSettings(page);
      await page.getByTestId(`library-series-move-up-${ctx.bookIds.tideTables}`).click();
      await page.getByTestId("library-series-save").click();
      await page.getByTestId("library-series-dialog").waitFor({ state: "hidden" });
      await page.getByTestId("library-series-stats").waitFor();
    },
  },
  {
    name: "ui-series-take-out",
    route: (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/settings#series`,
    steps: async (page) => {
      // Salt and Signal is first, so the dialog has a renumber line for Tide Tables.
      await page.getByTestId("settings-series-select").selectOption("");
      await page.getByTestId("settings-move-review").click();
      await page.getByTestId("settings-move-dialog").waitFor();
      await page.getByTestId("settings-move-from-to").waitFor();
    },
  },
  {
    name: "ui-series-left",
    route: (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/settings#series`,
    steps: async (page, ctx) => {
      await page.getByTestId("settings-series-select").selectOption("");
      await page.getByTestId("settings-move-review").click();
      await page.getByTestId("settings-move-dialog").waitFor();
      await page.getByTestId("settings-move-confirm").click();
      await page.getByTestId("settings-move-dialog").waitFor({ state: "hidden" });
      await page.goto(`/#series=${ctx.seriesId}`);
      await page.getByTestId("library-series-stats").waitFor();
      await page.getByTestId(`shell-tile-${ctx.bookIds.tideTables}`).waitFor();
    },
  },
  {
    name: "ui-series-add-book",
    route: "/",
    steps: async (page, ctx) => {
      // The seed has no standalone book, so make one and open its settings.
      const response = await page.request.post("/api/books", { data: { title: "Lamp Room Notes" } });
      if (!response.ok()) throw new Error(`POST /api/books answered ${response.status()}.`);
      const body = (await response.json()) as { id: string };
      await page.goto(`/books/${body.id}/settings#series`);
      await page.getByTestId("settings-series-select").selectOption(ctx.seriesId);
      await page.getByTestId("settings-move-review").click();
      await page.getByTestId("settings-move-dialog").waitFor();
      await page.getByTestId("settings-move-from-to").waitFor();
    },
  },
  {
    name: "ui-series-joined",
    route: "/",
    steps: async (page, ctx) => {
      const response = await page.request.post("/api/books", { data: { title: "Lamp Room Notes" } });
      if (!response.ok()) throw new Error(`POST /api/books answered ${response.status()}.`);
      const body = (await response.json()) as { id: string };
      await page.goto(`/books/${body.id}/settings#series`);
      await page.getByTestId("settings-series-select").selectOption(ctx.seriesId);
      await page.getByTestId("settings-move-review").click();
      await page.getByTestId("settings-move-dialog").waitFor();
      await page.getByTestId("settings-move-confirm").click();
      await page.getByTestId("settings-move-dialog").waitFor({ state: "hidden" });
      await page.goto(`/#series=${ctx.seriesId}`);
      await page.getByTestId("library-series-stats").waitFor();
      await page.getByTestId(`shell-tile-${body.id}`).waitFor();
    },
  },
  {
    name: "ui-series-shared-entry",
    route: "/",
    steps: async (page, ctx) => {
      // Journey 27, steps 4 and 5: move Harrowmouth up to the series, change it from Tide Tables, and read the change in Salt and Signal.
      const entryId = ctx.entryIds["Harrowmouth"];
      const hash = `#kb=${entryId}&entry=${entryId}`;
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/plan${hash}`);
      await page.getByTestId("kb-entry-name").waitFor();
      await page.getByTestId("kb-entry-menu").click();
      await page.getByTestId("kb-entry-menu-promote").click();
      await page.getByTestId("kb-promote-dialog").waitFor();
      await page.getByTestId("kb-promote-confirm").click();
      await page.getByTestId("kb-promote-dialog").waitFor({ state: "hidden" });
      await page.goto(`/books/${ctx.bookIds.tideTables}/plan${hash}`);
      await page.getByTestId("kb-entry-summary").waitFor();
      const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.ok());
      await page.getByTestId("kb-entry-summary").fill("An invented fishing town on the Working Coasts, edited from Tide Tables.");
      await page.getByTestId("kb-entry-summary").blur();
      await saved;
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/plan${hash}`);
      await page.getByTestId(`shell-kb-item-${entryId}`).waitFor();
      await page.waitForFunction(
        () => (document.querySelector('[data-testid="kb-entry-summary"]') as HTMLTextAreaElement | null)?.value.includes("edited from Tide Tables") === true,
      );
    },
  },
  {
    name: "ui-series-archived",
    route: (ctx: SeedResult) => `/#series=${ctx.seriesId}`,
    steps: async (page, ctx) => {
      await openSettings(page);
      await page.getByTestId("library-series-archive").click();
      await page.getByTestId("library-series-title").waitFor({ state: "hidden" });
      await page.goto("/?status=archived");
      await page.getByTestId(`library-restore-series-${ctx.seriesId}`).waitFor();
    },
  },
  {
    name: "ui-series-delete",
    route: (ctx: SeedResult) => `/#series=${ctx.seriesId}`,
    steps: async (page) => {
      await openSettings(page);
      await page.getByTestId("library-series-delete").click();
      await page.getByTestId("library-series-delete-dialog").waitFor();
      await page.getByTestId("library-series-delete-impact").waitFor();
    },
  },
  {
    name: "ui-series-deleted",
    route: (ctx: SeedResult) => `/#series=${ctx.seriesId}`,
    steps: async (page, ctx) => {
      await openSettings(page);
      await page.getByTestId("library-series-delete").click();
      await page.getByTestId("library-series-delete-dialog").waitFor();
      await page.getByTestId("library-series-delete-confirm").click();
      await page.getByTestId("library-series-delete-dialog").waitFor({ state: "hidden" });
      await page.goto("/?status=archived");
      await page.getByTestId(`library-archived-series-${ctx.seriesId}`).waitFor();
    },
  },
];
