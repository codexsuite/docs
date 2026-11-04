import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Plan screen: the board, the outline, adding, renaming, moving, merging and archiving. */

const planRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/plan`;

/** Opens the plan on the board and waits for the first act. */
async function openBoard(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(planRoute(ctx));
  await page.getByTestId("plan-board").waitFor();
  await page.getByTestId(`plan-act-${ctx.actIds["The Light"]}`).waitFor();
  await page.getByTestId(`plan-chapter-${ctx.chapterIds["1"]}`).waitFor();
}

/** Expands the act that holds the given chapter, because the third act starts collapsed. */
async function expandAct(page: Page, ctx: SeedResult, actTitle: string, chapter: string): Promise<void> {
  const chapterCard = page.getByTestId(`plan-chapter-${ctx.chapterIds[chapter]}`);
  if ((await chapterCard.count()) === 0) {
    await page.getByTestId(`plan-act-toggle-${ctx.actIds[actTitle]}`).click();
  }
  await chapterCard.waitFor();
}

async function openSceneMenu(page: Page, ctx: SeedResult, scene: string): Promise<void> {
  const id = ctx.sceneIds[scene];
  await page.getByTestId(`plan-scene-${id}`).hover();
  await page.getByTestId(`plan-scene-more-${id}`).click();
  await page.getByTestId(`plan-scene-open-write-${id}`).waitFor();
}

export const shots: ShotSpec[] = [
  {
    name: "ui-plan-overview",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await page.getByTestId("plan-toolbar").waitFor();
    },
  },
  {
    name: "ui-plan-outline",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await page.getByTestId("plan-view-outline").click();
      await page.getByTestId("plan-outline").waitFor();
    },
  },
  {
    name: "ui-plan-find",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await page.getByTestId("plan-search").fill("lens");
      await page.getByTestId(`plan-scene-${ctx.sceneIds["1.2"]}`).waitFor();
    },
  },
  {
    name: "ui-plan-new-chapter",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await page.getByTestId(`plan-new-chapter-${ctx.actIds["The Light"]}`).click();
      await page.getByText("New chapter", { exact: true }).first().waitFor();
    },
  },
  {
    name: "ui-plan-new-scene",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await page.getByTestId(`plan-new-scene-${ctx.chapterIds["1"]}`).click();
      await page.getByTestId(`plan-scene-summary-empty-${ctx.sceneIds["1.2"]}`).first().waitFor().catch(() => undefined);
      await page.locator("[data-testid^='plan-scene-title-']").nth(2).waitFor();
    },
  },
  {
    name: "ui-plan-rename-chapter",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const id = ctx.chapterIds["1"];
      await page.getByTestId(`plan-chapter-${id}`).hover();
      await page.getByTestId(`plan-chapter-more-${id}`).click();
      await page.getByTestId(`plan-chapter-rename-${id}`).click();
      await page.getByTestId(`plan-chapter-title-input-${id}`).fill("The Lamp Room, restored");
    },
  },
  {
    name: "ui-plan-rename-empty",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const id = ctx.chapterIds["1"];
      await page.getByTestId(`plan-chapter-${id}`).hover();
      await page.getByTestId(`plan-chapter-more-${id}`).click();
      await page.getByTestId(`plan-chapter-rename-${id}`).click();
      const input = page.getByTestId(`plan-chapter-title-input-${id}`);
      await input.fill("");
      await input.press("Enter");
      await page.getByTestId(`plan-chapter-title-error-${id}`).waitFor();
    },
  },
  {
    name: "ui-plan-move-scene",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await openSceneMenu(page, ctx, "1.1");
      await page.getByTestId(`plan-scene-move-${ctx.sceneIds["1.1"]}`).click();
      await page.getByTestId(`plan-scene-move-target-${ctx.chapterIds["2"]}`).waitFor();
    },
  },
  {
    name: "ui-plan-moved-scene",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await openSceneMenu(page, ctx, "1.1");
      await page.getByTestId(`plan-scene-move-${ctx.sceneIds["1.1"]}`).click();
      await page.getByTestId(`plan-scene-move-target-${ctx.chapterIds["2"]}`).click();
      await page.getByTestId(`plan-chapter-${ctx.chapterIds["2"]}`).getByTestId(`plan-scene-${ctx.sceneIds["1.1"]}`).waitFor();
    },
  },
  {
    name: "ui-plan-merge",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await openSceneMenu(page, ctx, "2.2");
      await page.getByTestId(`plan-scene-merge-${ctx.sceneIds["2.2"]}`).waitFor();
    },
  },
  {
    name: "ui-plan-merged",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await openSceneMenu(page, ctx, "2.2");
      await page.getByTestId(`plan-scene-merge-${ctx.sceneIds["2.2"]}`).click();
      await page.getByText("Scenes merged · the later scene is in Archived").waitFor();
    },
  },
  {
    name: "ui-plan-merge-refused",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await openSceneMenu(page, ctx, "1.2");
      await page.getByTestId(`plan-scene-merge-${ctx.sceneIds["1.2"]}`).click();
      await page.getByText("Could not merge the scene: Apply or discard the draft first.").waitFor();
    },
  },
  {
    name: "ui-plan-archive-scene",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await openSceneMenu(page, ctx, "2.1");
      await page.getByTestId(`plan-scene-archive-${ctx.sceneIds["2.1"]}`).click();
      await page.getByText("Scene archived", { exact: false }).first().waitFor();
    },
  },
  {
    name: "ui-plan-archived-list",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await openSceneMenu(page, ctx, "2.1");
      await page.getByTestId(`plan-scene-archive-${ctx.sceneIds["2.1"]}`).click();
      await page.getByText("Archived (1)").waitFor();
      await page.getByTestId("plan-archived-toggle").click();
      await page.getByTestId(`plan-restore-${ctx.sceneIds["2.1"]}`).waitFor();
    },
  },
  {
    name: "ui-plan-delete-chapter",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const id = ctx.chapterIds["2"];
      await page.getByTestId(`plan-chapter-${id}`).hover();
      await page.getByTestId(`plan-chapter-more-${id}`).click();
      await page.getByTestId(`plan-chapter-delete-${id}`).click();
      await page.getByText("Chapter archived", { exact: false }).first().waitFor();
    },
  },
  {
    name: "ui-plan-restore-both",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await openSceneMenu(page, ctx, "2.1");
      await page.getByTestId(`plan-scene-archive-${ctx.sceneIds["2.1"]}`).click();
      await page.getByText("Archived (1)").waitFor();
      const id = ctx.chapterIds["2"];
      await page.getByTestId(`plan-chapter-${id}`).hover();
      await page.getByTestId(`plan-chapter-more-${id}`).click();
      await page.getByTestId(`plan-chapter-delete-${id}`).click();
      await page.getByTestId(`plan-chapter-${id}`).waitFor({ state: "detached" });
      await page.getByTestId("plan-archived-toggle").click();
      await page.getByTestId(`plan-restore-${ctx.sceneIds["2.1"]}`).click();
      await page.getByTestId("plan-restore-prompt").waitFor();
    },
  },
  {
    name: "ui-plan-labels",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await page.getByTestId("plan-label-filter").click();
      await page.getByTestId("plan-label-filter-panel").waitFor();
    },
  },
];
