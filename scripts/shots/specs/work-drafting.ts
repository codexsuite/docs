import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Working with Codex: drafting. Scene 1.2 holds the seeded beat and its pending draft. */

const writeRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.2`;

/** Opens scene 1.2 in Write and waits for the pending draft. */
async function openDraft(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(writeRoute(ctx));
  await page.locator("[data-testid^='write-draft-apply-']").first().waitFor();
}

/** Adds Tobias Venn to the beat's context and waits for his chip. */
async function addTobiasVenn(page: Page, ctx: SeedResult): Promise<void> {
  await page.locator("[data-testid^='write-beat-context-add-']").first().click();
  const saved = page.waitForResponse(
    (r) => r.request().method() === "PUT" && /\/api\/beats\/[^/]+\/context$/.test(new URL(r.url()).pathname) && r.ok(),
  );
  await page.getByTestId(`write-beat-context-option-${ctx.entryIds["Tobias Venn"]}`).click();
  await saved;
  await page.locator("[data-testid^='write-beat-context-'][title^='Remove from']").first().waitFor();
}

/** Applies the pending draft and waits until the draft panel is gone. */
async function applyDraft(page: Page, ctx: SeedResult): Promise<void> {
  await openDraft(page, ctx);
  await page.locator("[data-testid^='write-draft-apply-']").first().click();
  await page.locator("[data-testid^='write-draft-apply-']").first().waitFor({ state: "detached" });
  await page.getByTestId("editing-save-status").and(page.locator("[data-state='saved']")).waitFor();
}

/** Types a sentence at the end of scene 1.2 by hand and waits until it is saved. */
async function editByHand(page: Page, ctx: SeedResult): Promise<void> {
  const editor = page.getByTestId(`write-scene-${ctx.sceneIds["1.2"]}`).getByTestId("prose-editor");
  await editor.click({ position: { x: 12, y: 8 } });
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("She wrote the count in the log. ");
  await page.locator("[data-testid='editing-save-status']:not([data-state='saved'])").waitFor();
  await page.getByTestId("editing-save-status").and(page.locator("[data-state='saved']")).waitFor();
}

/** Applies the draft, then opens Version history on scene 1.2. */
async function openHistory(page: Page, ctx: SeedResult): Promise<void> {
  await applyDraft(page, ctx);
  await editByHand(page, ctx);
  await page.getByTestId(`write-scene-more-${ctx.sceneIds["1.2"]}`).click();
  await page.getByTestId(`write-scene-history-${ctx.sceneIds["1.2"]}`).click();
  await page.getByTestId("write-history-list").waitFor();
  await page.locator("[data-testid^='write-history-row-'][data-source='ai_apply']").waitFor();
  await page.locator("[data-testid^='write-history-row-']").first().and(page.locator("[data-source='autosave']")).waitFor();
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
      await addTobiasVenn(page, ctx);
    },
  },
  {
    name: "work-drafting-new-beat",
    route: writeRoute,
    steps: async (page, ctx) => {
      await page.goto(writeRoute(ctx));
      await page.locator("[data-testid^='write-draft-apply-']").first().waitFor();
      const editor = page.getByTestId(`write-scene-${ctx.sceneIds["1.2"]}`).getByTestId("prose-editor");
      await editor.click({ position: { x: 12, y: 8 } });
      await page.keyboard.press("Control+Home");
      const inserted = page.waitForResponse(
        (r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/scenes/${ctx.sceneIds["1.2"]}/beats` && r.ok(),
      );
      await page.keyboard.type("/scene");
      await page.getByTestId("prose-slash-item-scene-beat").click();
      const beatId = ((await (await inserted).json()) as { beatId: string }).beatId;
      await page.getByTestId(`write-beat-generate-${beatId}`).and(page.locator("[disabled]")).waitFor();
      const body = page.getByTestId(`write-beat-body-${beatId}`);
      await body.fill("Edith counts the flashes until dawn while Tobias checks the lens.");
      const patched = page.waitForResponse(
        (r) => r.request().method() === "PATCH" && new URL(r.url()).pathname === `/api/beats/${beatId}` && r.ok(),
      );
      await body.blur();
      await patched;
      await page.getByTestId(`write-beat-generate-${beatId}`).and(page.locator(":enabled")).waitFor();
      await page.getByTestId(`write-beat-generate-${beatId}`).click();
      await page.getByTestId(`write-draft-apply-${beatId}`).waitFor();
    },
  },
  {
    name: "work-drafting-sent",
    route: writeRoute,
    steps: async (page, ctx) => {
      await openDraft(page, ctx);
      await addTobiasVenn(page, ctx);
      await page.locator("[data-testid^='write-draft-retry-']").first().click();
      await page.locator("[data-testid^='write-draft-meta-']").filter({ hasText: "attempt 2" }).first().waitFor();
      await page.locator("[data-testid^='write-draft-apply-']").first().waitFor();
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
    name: "work-drafting-undone",
    route: writeRoute,
    steps: async (page, ctx) => {
      await confirmRestore(page, ctx);
      await page.getByTestId("write-history-confirm").click();
      await page.getByTestId("editing-toast-undo").waitFor();
      await page.locator("[data-testid^='write-history-row-']").filter({ hasText: "Restored" }).first().waitFor();
      const rows = page.locator("[data-testid^='write-history-row-']");
      const before = await rows.count();
      await page.getByTestId("editing-toast-undo").last().click();
      await page.waitForFunction(
        (n) => document.querySelectorAll("[data-testid^='write-history-row-']").length > n,
        before,
      );
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
