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

async function moveSecondChapterLeft(page: Page, ctx: SeedResult): Promise<void> {
  const grip = page.getByTestId(`plan-grip-chapter-${ctx.chapterIds["2"]}`);
  await grip.focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await page.getByTestId("plan-chapter-heading").first().getByText("Oil and Brass").waitFor();
}

async function archiveScene(page: Page, ctx: SeedResult, scene: string): Promise<void> {
  const id = ctx.sceneIds[scene];
  await page.getByTestId(`plan-scene-${id}`).hover();
  await page.getByTestId(`plan-scene-more-${id}`).click();
  await page.getByTestId(`plan-scene-archive-${id}`).click();
  await page.getByText("Scene archived", { exact: false }).first().waitFor();
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
  {
    name: "work-structure-merge-refused",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const id = ctx.sceneIds["1.2"];
      await page.getByTestId(`plan-scene-${id}`).hover();
      await page.getByTestId(`plan-scene-more-${id}`).click();
      await page.getByTestId(`plan-scene-merge-${id}`).click();
      await page.getByText("Could not merge the scene: Apply or discard the draft first.").waitFor();
    },
  },
  {
    name: "work-structure-merged",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      const id = ctx.sceneIds["2.2"];
      await page.getByTestId(`plan-scene-${id}`).hover();
      await page.getByTestId(`plan-scene-more-${id}`).click();
      await page.getByTestId(`plan-scene-merge-${id}`).click();
      await page.getByText("Scenes merged · the later scene is in Archived").waitFor();
    },
  },
  {
    name: "work-structure-outline-moved",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await moveSecondChapterLeft(page, ctx);
      await archiveScene(page, ctx, "2.2");
      await page.getByTestId("plan-view-outline").click();
      await page.getByTestId("plan-outline").waitFor();
    },
  },
  {
    name: "work-structure-chapter-link",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`,
    steps: async (page, ctx) => {
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`);
      const editor = page.getByTestId(`write-scene-${ctx.sceneIds["1.1"]}`).getByTestId("prose-editor");
      await editor.waitFor();
      await editor.click({ position: { x: 12, y: 8 } });
      await editor.evaluate((element) => {
        window.getSelection()?.collapse(element.firstElementChild, 0);
        document.dispatchEvent(new Event("selectionchange"));
      });
      await page.keyboard.type("/chapter");
      await page.getByTestId("prose-slash-item-chapter-reference").click();
      await page.getByTestId("write-chapter-picker").waitFor();
      await page.getByTestId(`write-chapter-picker-${ctx.chapterIds["2"]}`).click();
      await page.getByTestId("write-chapter-ref").first().waitFor();
      await page.getByTestId("write-manuscript").focus();
      await page.waitForFunction(
        () => document.querySelector("[data-testid='editing-save-status']")?.getAttribute("data-state") === "saved",
      );
      await page.goto(planRoute(ctx));
      await page.getByTestId(`plan-chapter-${ctx.chapterIds["2"]}`).waitFor();
      await moveSecondChapterLeft(page, ctx);
      // The scene that held the link is now scene 2.1, because the chapters renumbered.
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=2.1`);
      await page.getByTestId("write-chapter-ref").filter({ hasText: "Chapter 1" }).first().waitFor();
    },
  },
  {
    name: "work-structure-source-archived",
    route: planRoute,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await archiveScene(page, ctx, "2.1");
      await page.getByText("source use archived", { exact: false }).first().waitFor();
    },
  },
  {
    name: "work-structure-references-after",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/references`,
    steps: async (page, ctx) => {
      await openBoard(page, ctx);
      await archiveScene(page, ctx, "2.1");
      await page.getByText("source use archived", { exact: false }).first().waitFor();
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/references`);
      await page.getByText("Signals at Sea").first().waitFor();
    },
  },
];
