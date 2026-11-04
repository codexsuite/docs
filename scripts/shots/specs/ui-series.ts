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
    route: (ctx: SeedResult) => `/#series=${ctx.seriesId}`,
    steps: async (page) => {
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
    name: "ui-series-delete",
    route: (ctx: SeedResult) => `/#series=${ctx.seriesId}`,
    steps: async (page) => {
      await openSettings(page);
      await page.getByTestId("library-series-delete").click();
      await page.getByTestId("library-series-delete-dialog").waitFor();
      await page.getByTestId("library-series-delete-impact").waitFor();
    },
  },
];
