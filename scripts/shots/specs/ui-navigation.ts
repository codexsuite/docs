import type { ShotSpec } from "../types.ts";

const unknownBookId = "00000000-0000-0000-0000-000000000000";

export const shots: ShotSpec[] = [
  {
    name: "ui-navigation-overview",
    route: (ctx) => `/#series=${ctx.seriesId}`,
    steps: async (page, ctx) => {
      await page.getByTestId(`shell-tile-${ctx.bookIds.saltAndSignal}`).click();
      await page.waitForURL(/\/books\/[^/]+\/plan/);
      await page.getByTestId("shell-book-bar").waitFor();
      await page.getByTestId("shell-kb-sidebar").waitFor();
      await page.getByTestId("plan-page").waitFor();
    },
  },
  {
    name: "ui-navigation-library-tile",
    route: (ctx) => `/#series=${ctx.seriesId}`,
    steps: async (page, ctx) => {
      await page.getByTestId(`shell-tile-${ctx.bookIds.saltAndSignal}`).waitFor();
    },
  },
  {
    name: "ui-navigation-open-in-write",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/plan`,
    steps: async (page, ctx) => {
      const scene = ctx.sceneIds["1.2"];
      await page.getByTestId(`plan-scene-${scene}`).hover();
      await page.getByTestId(`plan-scene-more-${scene}`).click();
      await page.getByTestId(`plan-scene-open-write-${scene}`).waitFor();
    },
  },
  {
    name: "ui-navigation-deep-link",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/plan`,
    steps: async (page, ctx) => {
      const scene = ctx.sceneIds["1.2"];
      await page.getByTestId(`plan-scene-${scene}`).hover();
      await page.getByTestId(`plan-scene-more-${scene}`).click();
      await page.getByTestId(`plan-scene-open-write-${scene}`).click();
      await page.waitForURL(/\/write#scene=1\.2$/);
      await page.getByTestId(`write-scene-heading-${ctx.sceneIds["1.2"]}`).waitFor();
    },
  },
  {
    name: "ui-navigation-palette",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("library-new-book").waitFor();
      await page.keyboard.press("Control+k");
      await page.getByTestId("shell-command-palette").waitFor();
      await page.getByTestId("library-palette-input").fill("Salt");
      await page.getByTestId("library-palette-list").getByText("Salt and Signal").first().waitFor();
    },
  },
  {
    name: "ui-navigation-bad-link",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/plan#scene=abc`,
    steps: async (page) => {
      await page.getByTestId("shell-error-bad-link").waitFor();
    },
  },
  {
    name: "ui-navigation-unknown-book",
    route: `/books/${unknownBookId}/plan`,
    steps: async (page) => {
      await page.getByTestId("shell-error-unknown-book").waitFor();
    },
  },
  {
    name: "ui-navigation-view-only",
    as: "viewer",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/plan`,
    steps: async (page) => {
      await page.getByTestId("shell-role-chip").waitFor();
    },
  },
];

