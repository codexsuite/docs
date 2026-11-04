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

async function openSceneMenu(page: Page, ctx: SeedResult, scene: string): Promise<void> {
  const id = ctx.sceneIds[scene];
  await page.getByTestId(`plan-scene-${id}`).hover();
  await page.getByTestId(`plan-scene-more-${id}`).click();
  await page.getByTestId(`plan-scene-open-write-${id}`).waitFor();
}

const chapterOf = (page: Page, id: string) => page.getByTestId(`plan-chapter-${id}`);
const isPositionWrite = (response: { url(): string; request(): { method(): string } }) =>
  response.request().method() === "PUT" && response.url().includes("/position");

/** Holds the second chapter's grip over the left edge of the first chapter, with the drop line showing. The mouse stays down. */
async function dragChapterOverFirst(page: Page, ctx: SeedResult): Promise<void> {
  const moving = ctx.chapterIds["2"];
  await chapterOf(page, moving).hover();
  const grip = page.getByTestId(`plan-grip-chapter-${moving}`);
  await grip.scrollIntoViewIfNeeded();
  const from = await grip.boundingBox();
  const onto = await chapterOf(page, ctx.chapterIds["1"]).boundingBox();
  if (!from || !onto) throw new Error("The chapter grips are not on screen.");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x - 10, from.y + 10, { steps: 4 });
  await page.mouse.move(onto.x + 20, onto.y + 20, { steps: 10 });
  await page.getByTestId("plan-drop-line").waitFor();
}

const headingOf = (page: Page, chapterId: string, text: string) =>
  chapterOf(page, chapterId).getByTestId("plan-chapter-heading").filter({ hasText: text });

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
      const chapter = page.getByTestId(`plan-chapter-${ctx.chapterIds["1"]}`);
      const cards = chapter.locator("[data-testid^='plan-scene-title-']");
      const before = await cards.count();
      await page.getByTestId(`plan-new-scene-${ctx.chapterIds["1"]}`).click();
      await cards.nth(before).waitFor();
      await chapter.locator("[contenteditable='true']:focus").waitFor();
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
    name: "ui-plan-drag-chapter",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      // Escape cancels a drag: the drop line goes and the order stays.
      await dragChapterOverFirst(page, ctx);
      await page.keyboard.press("Escape");
      await page.getByTestId("plan-drop-line").waitFor({ state: "detached" });
      await page.mouse.up();
      await headingOf(page, ctx.chapterIds["2"], "Chapter 2").waitFor();
      // The second drag stays held for the capture.
      await dragChapterOverFirst(page, ctx);
    },
  },
  {
    name: "ui-plan-moved-chapter",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await dragChapterOverFirst(page, ctx);
      const saved = page.waitForResponse(isPositionWrite);
      await page.mouse.up();
      await saved;
      await headingOf(page, ctx.chapterIds["2"], "Chapter 1").waitFor();
      await headingOf(page, ctx.chapterIds["1"], "Chapter 2").waitFor();
    },
  },
  {
    name: "ui-plan-key-move-chapter",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const moving = ctx.chapterIds["2"];
      await chapterOf(page, moving).hover();
      await page.getByTestId(`plan-grip-chapter-${moving}`).focus();
      const saved = page.waitForResponse(isPositionWrite);
      await page.keyboard.press("Alt+ArrowDown");
      await saved;
      await page.getByTestId(`plan-act-${ctx.actIds["The Keepers"]}`).getByTestId(`plan-chapter-${moving}`).waitFor();
      await chapterOf(page, moving).hover();
    },
  },
  {
    name: "ui-plan-key-move-scene",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const moving = ctx.sceneIds["2.2"];
      await page.getByTestId(`plan-scene-${moving}`).hover();
      await page.getByTestId(`plan-grip-scene-${moving}`).focus();
      const saved = page.waitForResponse(isPositionWrite);
      await page.keyboard.press("Alt+ArrowDown");
      await saved;
      await chapterOf(page, ctx.chapterIds["3"]).getByTestId(`plan-scene-${moving}`).waitFor();
    },
  },
  {
    name: "ui-plan-moved-chapter-references",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const moving = ctx.chapterIds["2"];
      await chapterOf(page, moving).hover();
      await page.getByTestId(`plan-grip-chapter-${moving}`).focus();
      const saved = page.waitForResponse(isPositionWrite);
      await page.keyboard.press("Alt+ArrowLeft");
      await saved;
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/references`);
      await page.getByText("The Keeper's Ledger").first().waitFor();
    },
  },
  {
    name: "ui-plan-renamed-chapter",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const id = ctx.chapterIds["1"];
      await page.getByTestId(`plan-chapter-${id}`).hover();
      await page.getByTestId(`plan-chapter-more-${id}`).click();
      await page.getByTestId(`plan-chapter-rename-${id}`).click();
      const input = page.getByTestId(`plan-chapter-title-input-${id}`);
      await input.fill("The Lamp Room, restored");
      await input.press("Enter");
      await input.waitFor({ state: "detached" });
      await page.getByTestId(`plan-chapter-title-${id}`).filter({ hasText: "The Lamp Room, restored" }).waitFor();
    },
  },
  {
    name: "ui-plan-new-act",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const titles = page.locator("[data-testid^='plan-act-title-']");
      const before = await titles.count();
      await page.getByTestId("plan-new-act").click();
      const title = titles.nth(before);
      await title.waitFor();
      await title.fill("The Return");
      await title.press("Enter");
      await title.scrollIntoViewIfNeeded();
    },
  },
  {
    name: "ui-plan-rename-act",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const id = ctx.actIds["The Light"];
      await page.getByTestId(`plan-act-rename-${id}`).click();
      const title = page.getByTestId(`plan-act-title-${id}`);
      await title.fill("The Long Light");
      await title.press("Enter");
    },
  },
  {
    name: "ui-plan-delete-act",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const id = ctx.actIds["The Last Watch"];
      await page.getByTestId(`plan-act-${id}`).scrollIntoViewIfNeeded();
      await page.getByTestId(`plan-act-more-${id}`).click();
      await page.getByTestId(`plan-act-delete-${id}`).click();
      await page.getByText("Act deleted", { exact: false }).first().waitFor();
    },
  },
  {
    name: "ui-plan-undo-chapter",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const id = ctx.chapterIds["2"];
      await page.getByTestId(`plan-chapter-${id}`).hover();
      await page.getByTestId(`plan-chapter-more-${id}`).click();
      await page.getByTestId(`plan-chapter-delete-${id}`).click();
      await page.getByTestId(`plan-chapter-${id}`).waitFor({ state: "detached" });
      await page.getByTestId("editing-toast-undo").click();
      await page.getByTestId(`plan-chapter-${id}`).waitFor();
    },
  },
  {
    name: "ui-plan-restored-both",
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
      await page.getByTestId("plan-restore-both").click();
      await page.getByTestId(`plan-chapter-${id}`).getByTestId(`plan-scene-${ctx.sceneIds["2.1"]}`).waitFor();
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
