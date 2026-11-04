import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Working with Codex: drafting. Scene 1.2 holds the seeded beat and its pending draft. */

const writeRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.2`;

/** Opens scene 1.2 in Write and waits for the pending draft. */
async function openDraft(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(writeRoute(ctx));
  await page.locator("[data-testid^='write-draft-apply-']").first().waitFor();
}

/** Applies the pending draft and waits until the draft panel is gone. */
async function applyDraft(page: Page, ctx: SeedResult): Promise<void> {
  await openDraft(page, ctx);
  await page.locator("[data-testid^='write-draft-apply-']").first().click();
  await page.locator("[data-testid^='write-draft-apply-']").first().waitFor({ state: "detached" });
  await page.getByTestId("editing-save-status").and(page.locator("[data-state='saved']")).waitFor();
}

/** Applies the draft, then opens Version history on scene 1.2. */
async function openHistory(page: Page, ctx: SeedResult): Promise<void> {
  await applyDraft(page, ctx);
  await page.getByTestId(`write-scene-more-${ctx.sceneIds["1.2"]}`).click();
  await page.getByTestId(`write-scene-history-${ctx.sceneIds["1.2"]}`).click();
  await page.getByTestId("write-history-list").waitFor();
  await page.locator("[data-testid^='write-history-row-'][data-source='ai_apply']").waitFor();
}

/** Selects the oldest version in the list and asks to restore it. */
async function confirmRestore(page: Page, ctx: SeedResult): Promise<void> {
  await openHistory(page, ctx);
  await page.locator("[data-testid^='write-history-row-']").last().click();
  await page.getByTestId("write-history-compare").waitFor();
  await page.getByTestId("write-history-restore").click();
  await page.getByTestId("write-history-confirm-text").waitFor();
}

export const shots: ShotSpec[] = [
  {
    name: "work-drafting-overview",
    route: writeRoute,
    steps: openDraft,
  },
  {
    name: "work-drafting-beat",
    route: writeRoute,
    steps: async (page, ctx) => {
      await openDraft(page, ctx);
      await page.locator("[data-testid^='write-beat-context-add-']").first().click();
      await page.getByTestId(`write-beat-context-option-${ctx.entryIds["Tobias Venn"]}`).click();
      await page.locator("[data-testid^='write-beat-context-'][title^='Remove from']").first().waitFor();
    },
  },
  {
    name: "work-drafting-sent",
    route: writeRoute,
    steps: async (page, ctx) => {
      await openDraft(page, ctx);
      await page.locator("[data-testid^='write-draft-sent-']").first().click();
      await page.locator("[data-testid^='write-draft-sent-popover-']").first().waitFor();
    },
  },
  {
    name: "work-drafting-applied",
    route: writeRoute,
    steps: applyDraft,
  },
  {
    name: "work-drafting-history",
    route: writeRoute,
    steps: openHistory,
  },
  {
    name: "work-drafting-restore",
    route: writeRoute,
    steps: confirmRestore,
  },
  {
    name: "work-drafting-restored",
    route: writeRoute,
    steps: async (page, ctx) => {
      await confirmRestore(page, ctx);
      await page.getByTestId("write-history-confirm").click();
      await page.getByTestId("editing-toast-undo").waitFor();
    },
  },
  {
    name: "work-drafting-hide-beats",
    route: writeRoute,
    steps: async (page, ctx) => {
      await openDraft(page, ctx);
      await page.getByTestId("write-format-button").click();
      await page.getByTestId("write-format-beats-hide").click();
      await page.locator(".write-doc[data-hide-beats='true']").waitFor();
    },
  },
];
