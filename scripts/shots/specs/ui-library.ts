import type { ShotSpec } from "../types.ts";

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
    steps: async (page) => {
      await page.getByTestId("library-group-row").first().waitFor();
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
    },
  },
  {
    name: "ui-library-new-series",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("library-new-series").click();
      await page.getByTestId("library-new-series-dialog").waitFor();
      await page.getByTestId("library-series-name-field").fill("Harbour Lights");
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
];
