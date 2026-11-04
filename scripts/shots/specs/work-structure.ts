import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Planning the structure: the board of Salt and Signal, a summary, labels and a chapter moved. */

const planRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/plan`;

async function openBoard(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(planRoute(ctx));
  await page.getByTestId("plan-board").waitFor();
  await page.getByTestId(`plan-act-${ctx.actIds["The Light"]}`).waitFor();
  await page.getByTestId(`plan-chapter-${ctx.chapterIds["1"]}`).waitFor();
}

export const shots: ShotSpec[] = [
  {
    name: "work-structure-board",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await page.getByTestId("plan-toolbar").waitFor();
    },
  },
  {
    name: "work-structure-new-scene",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await page.getByTestId(`plan-new-scene-${ctx.chapterIds["1"]}`).click();
      await page.locator("[data-testid^='plan-scene-title-']").nth(2).waitFor();
    },
  },
  {
    name: "work-structure-labels",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await page.getByTestId("plan-label-filter").click();
      await page.getByTestId("plan-label-filter-panel").waitFor();
    },
  },
  {
    name: "work-structure-outline",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await page.getByTestId("plan-view-outline").click();
      await page.getByTestId("plan-outline").waitFor();
    },
  },
  {
    name: "work-structure-chapter-moved",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const second = ctx.chapterIds["2"];
      const grip = page.getByTestId(`plan-grip-chapter-${second}`);
      await grip.focus();
      await page.keyboard.press("Alt+ArrowLeft");
      await page
        .getByTestId(`plan-chapter-heading`)
        .first()
        .getByText("Oil and Brass")
        .waitFor();
    },
  },
  {
    name: "work-structure-scene-archived",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const id = ctx.sceneIds["2.2"];
      await page.getByTestId(`plan-scene-${id}`).hover();
      await page.getByTestId(`plan-scene-more-${id}`).click();
      await page.getByTestId(`plan-scene-archive-${id}`).click();
      await page.getByText("Scene archived", { exact: false }).first().waitFor();
    },
  },
];
