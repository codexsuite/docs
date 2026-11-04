import type { Page } from "playwright";
import type { ShotSpec } from "../types.ts";

/** Guide: your first book. Every shot starts at the Library and creates its own book, and the runner restores the snapshot afterwards. */

const bookTitle = "Lamp Room Notes";

/** Fills the New book dialog and creates the book. Ends on the empty Plan. */
async function createBook(page: Page): Promise<void> {
  await page.getByTestId("library-new-book").click();
  await page.getByTestId("library-new-book-dialog").waitFor();
  await page.getByTestId("library-new-book-title").fill(bookTitle);
  await page.getByTestId("library-new-book-target").fill("60000");
  await page.getByTestId("library-new-book-create").click();
  await page.getByTestId("plan-board").waitFor();
}

/** Adds the first chapter to the new book's only act. */
async function addChapter(page: Page): Promise<void> {
  await page.locator("[data-testid^='plan-new-chapter-']").first().click();
  await page.locator("[data-testid^='plan-new-scene-']").first().waitFor();
}

/** Adds the first scene. The new card takes focus in its summary. */
async function newScene(page: Page): Promise<void> {
  await page.locator("[data-testid^='plan-new-scene-']").first().click();
  await page.locator("[data-testid^='plan-scene-summary-']").first().waitFor();
}

/** Adds the first scene and types its summary. */
async function addScene(page: Page): Promise<void> {
  await newScene(page);
  await page.locator("[data-testid^='plan-scene-summary-']").first().click();
  await page.keyboard.type("Orla climbs the stair to the lamp room and finds the lens dark.");
  await page.getByTestId("editing-save-status").and(page.locator("[data-state='saved']")).waitFor();
}

export const shots: ShotSpec[] = [
  {
    name: "start-guides-first-book-overview",
    route: "/",
    steps: async (page) => {
      await createBook(page);
      await addChapter(page);
      await addScene(page);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(800, 700);
    },
  },
  {
    name: "start-guides-first-book-new-book",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("library-new-book").click();
      await page.getByTestId("library-new-book-dialog").waitFor();
      await page.getByTestId("library-new-book-title").fill(bookTitle);
      await page.getByTestId("library-new-book-target").fill("60000");
    },
  },
  {
    name: "start-guides-first-book-empty-plan",
    route: "/",
    steps: async (page) => {
      await createBook(page);
    },
  },
  {
    name: "start-guides-first-book-chapter",
    route: "/",
    steps: async (page) => {
      await createBook(page);
      await addChapter(page);
    },
  },
  {
    name: "start-guides-first-book-scene",
    route: "/",
    steps: async (page) => {
      await createBook(page);
      await addChapter(page);
      await newScene(page);
    },
  },
  {
    name: "start-guides-first-book-write",
    route: "/",
    steps: async (page) => {
      await createBook(page);
      await addChapter(page);
      await addScene(page);
      await page.getByTestId("shell-tab-write").click();
      const prose = page.getByTestId("prose-editor").first();
      await prose.waitFor();
      await prose.click();
      await page.keyboard.type("The stair had forty-one steps, and Orla counted every one.");
      await page.getByTestId("editing-save-status").and(page.locator("[data-state='saved']")).waitFor();
    },
  },
];
