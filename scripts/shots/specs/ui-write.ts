import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Write screen: the editor, mentions, the / menu, Format, scope, Focus, find and replace, version history, failed saves and the Updated elsewhere notice. */

const writeRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`;
const writeRoute12 = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.2`;

const editorOf = (page: Page, ctx: SeedResult, scene: string) =>
  page.getByTestId(`write-scene-${ctx.sceneIds[scene]}`).getByTestId("prose-editor");
const status = (page: Page) => page.getByTestId("editing-save-status");
const savedStatus = (page: Page) => status(page).and(page.locator("[data-state='saved']"));

async function open(page: Page, ctx: SeedResult, scene = "1.1"): Promise<void> {
  await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=${scene}`);
  await editorOf(page, ctx, scene).waitFor();
  await savedStatus(page).waitFor();
}

/** Puts the caret at the end of the scene and types. */
async function typeAtEnd(page: Page, ctx: SeedResult, scene: string, text: string): Promise<void> {
  await editorOf(page, ctx, scene).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

/** Moves focus out of the editor so a pending edit is sent. */
const leaveEditor = (page: Page) => page.getByTestId("write-manuscript").focus();

const isProseWrite = (r: { url(): string; request(): { method(): string } }) =>
  r.request().method() === "PUT" && /\/api\/scenes\/[^/]+\/prose$/.test(new URL(r.url()).pathname);

/** Scopes to chapter 1, sets Format to narrow, indented, summaries hidden. Mirrors the focus journey. */
async function scopeAndFormat(page: Page, ctx: SeedResult): Promise<void> {
  await open(page, ctx);
  await page.getByTestId("write-scope-select").selectOption(`chapter:${ctx.chapterIds["1"]}`);
  await page.getByTestId(`write-scene-${ctx.sceneIds["2.1"]}`).waitFor({ state: "detached" });
  await page.getByTestId("write-format-button").click();
  await page.getByTestId("write-format-width-narrow").click();
  await page.getByTestId("write-format-paragraphs-indent").click();
  await page.getByTestId("write-format-summaries-hide").click();
  await page.locator("[data-testid='write-manuscript'][data-width='narrow'][data-paragraphs='indent'][data-hide-summaries='true']").waitFor();
  await page.keyboard.press("Escape");
  await page.getByTestId("write-format-popover").waitFor({ state: "detached" });
}

async function enterFocus(page: Page, ctx: SeedResult): Promise<void> {
  await scopeAndFormat(page, ctx);
  await page.getByTestId("write-focus-button").click();
  await page.locator("[data-testid='write-focus-button'][aria-pressed='true']").waitFor();
  await page.getByTestId("write-minimap").waitFor({ state: "hidden" });
}

/** Types two words at the start of the focused scene and waits for the save. */
async function typeInFocus(page: Page, ctx: SeedResult): Promise<void> {
  await enterFocus(page, ctx);
  await editorOf(page, ctx, "1.1").hover();
  const saved = page.waitForResponse((r) => isProseWrite(r) && r.ok());
  await editorOf(page, ctx, "1.1").click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("Focused words ");
  await saved;
  await savedStatus(page).waitFor();
}

async function leaveFocus(page: Page, ctx: SeedResult): Promise<void> {
  await typeInFocus(page, ctx);
  await page.keyboard.press("Escape");
  await page.locator("[data-testid='write-focus-button'][aria-pressed='false']").waitFor();
  await page.getByTestId("write-minimap").waitFor();
  await page.getByTestId("write-scope-select").selectOption("book");
  await page.getByTestId(`write-scene-${ctx.sceneIds["2.1"]}`).waitFor();
}

/** Opens Replace with a find text and a replacement over the whole manuscript. */
async function openReplace(page: Page, ctx: SeedResult, find: string, replacement: string): Promise<void> {
  await open(page, ctx);
  await page.getByTestId("write-find").fill(find);
  await page.getByTestId("write-replace-toggle").click();
  await page.getByTestId("write-replace-input").fill(replacement);
  await page.locator("[data-testid='write-replace-count']:has-text('match')").waitFor();
  await page.getByTestId("write-replace-item-0").waitFor();
}

async function replaceAll(page: Page, ctx: SeedResult): Promise<void> {
  await openReplace(page, ctx, "Tobias", "Toby");
  await page.getByTestId("write-replace-all").and(page.locator(":enabled")).click();
  await page.getByTestId("editing-toast").filter({ hasText: "Replaced" }).waitFor();
}

/** Applies the pending draft on scene 1.2 and waits for the save. */
async function applyDraft(page: Page, ctx: SeedResult): Promise<void> {
  await open(page, ctx, "1.2");
  const apply = page.locator("[data-testid^='write-draft-apply-']").first();
  await apply.click();
  await apply.waitFor({ state: "detached" });
  await savedStatus(page).waitFor();
}

async function openHistory(page: Page, ctx: SeedResult): Promise<void> {
  await applyDraft(page, ctx);
  await typeAtEnd(page, ctx, "1.2", " She wrote the count in the log.");
  await page.locator("[data-testid='editing-save-status']:not([data-state='saved'])").waitFor();
  await savedStatus(page).waitFor();
  await page.getByTestId(`write-scene-more-${ctx.sceneIds["1.2"]}`).click();
  await page.getByTestId(`write-scene-history-${ctx.sceneIds["1.2"]}`).click();
  await page.getByTestId("write-history-list").waitFor();
  await page.locator("[data-testid^='write-history-row-'][data-source='ai_apply']").waitFor();
  await page.locator("[data-testid^='write-history-row-'][data-source='autosave']").first().waitFor();
}

async function confirmRestore(page: Page, ctx: SeedResult): Promise<void> {
  await openHistory(page, ctx);
  await page.locator("[data-testid^='write-history-row-'][data-source='ai_apply']").click();
  await page.getByTestId("write-history-compare").waitFor();
  await page.getByTestId("write-history-restore").click();
  await page.getByTestId("write-history-confirm-text").waitFor();
}

/** Makes the next saves of scene prose fail with a server error, types, and waits for Unsaved with Retry. */
async function failSave(page: Page, ctx: SeedResult): Promise<void> {
  await open(page, ctx, "2.1");
  await page.route("**/api/scenes/*/prose", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Something went wrong on the server.", code: "internal_error" }) })
      : route.fallback(),
  );
  await typeAtEnd(page, ctx, "2.1", " Ship small.");
  await leaveEditor(page);
  await page.getByTestId("editing-save-status-retry").waitFor();
}

async function retrySave(page: Page, ctx: SeedResult): Promise<void> {
  await failSave(page, ctx);
  await page.unroute("**/api/scenes/*/prose");
  await page.getByTestId("editing-save-status-retry").click();
  await savedStatus(page).waitFor();
  await editorOf(page, ctx, "2.1").getByText("Ship small.").waitFor();
}

/** Opens the same scene in a second tab, types there, and waits for the first tab to say Updated elsewhere. */
async function updatedElsewhere(page: Page, ctx: SeedResult): Promise<() => Promise<void>> {
  await open(page, ctx, "2.1");
  const other = await page.context().newPage();
  await other.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=2.1`);
  await editorOf(other, ctx, "2.1").waitFor();
  await savedStatus(other).waitFor();
  await typeAtEnd(other, ctx, "2.1", " One two three.");
  await leaveEditor(other);
  await other.locator("[data-testid='editing-save-status'][data-state='saving'],[data-testid='editing-save-status'][data-state='unsaved']").first().waitFor();
  await savedStatus(other).waitFor();
  await page.locator("[data-testid='editing-save-status'][data-state='remoteChanged']").waitFor();
  return () => other.close();
}

export const shots: ShotSpec[] = [
  { name: "ui-write-overview", route: writeRoute, steps: (page, ctx) => open(page, ctx) },
  {
    name: "ui-write-mention-picker",
    route: writeRoute,
    steps: async (page, ctx) => {
      await open(page, ctx);
      await typeAtEnd(page, ctx, "1.1", " Then @Tob");
      await page.getByTestId(`prose-mention-option-${ctx.entryIds["Tobias Venn"]}`).waitFor();
    },
  },
  {
    name: "ui-write-mention",
    route: writeRoute,
    steps: async (page, ctx) => {
      await open(page, ctx);
      await typeAtEnd(page, ctx, "1.1", " Then @Tob");
      await page.getByTestId(`prose-mention-option-${ctx.entryIds["Tobias Venn"]}`).click();
      await editorOf(page, ctx, "1.1").locator("[data-mention]").filter({ hasText: "Tobias Venn" }).last().waitFor();
      await leaveEditor(page);
      await savedStatus(page).waitFor();
    },
  },
  {
    name: "ui-write-slash-menu",
    route: writeRoute,
    steps: async (page, ctx) => {
      await open(page, ctx);
      await typeAtEnd(page, ctx, "1.1", " /");
      await page.getByTestId("prose-slash-menu").waitFor();
    },
  },
  {
    name: "ui-write-source",
    route: writeRoute,
    steps: async (page, ctx) => {
      await open(page, ctx);
      const scene = page.getByTestId(`write-scene-${ctx.sceneIds["1.1"]}`);
      await scene.getByTestId("prose-mode-source-scene-prose").click();
      await scene.getByTestId("prose-source-editor-scene-prose").waitFor();
    },
  },
  {
    name: "ui-write-format",
    route: writeRoute,
    steps: async (page, ctx) => {
      await open(page, ctx);
      await page.getByTestId("write-format-button").click();
      await page.getByTestId("write-format-width-narrow").click();
      await page.getByTestId("write-format-paragraphs-indent").click();
      await page.getByTestId("write-format-popover").waitFor();
      await page.locator("[data-testid='write-manuscript'][data-width='narrow'][data-paragraphs='indent']").waitFor();
    },
  },
  {
    name: "ui-write-scope",
    route: writeRoute,
    steps: async (page, ctx) => {
      await open(page, ctx);
      await page.getByTestId("write-scope-select").selectOption(`chapter:${ctx.chapterIds["1"]}`);
      await page.getByTestId(`write-scene-${ctx.sceneIds["2.1"]}`).waitFor({ state: "detached" });
    },
  },
  { name: "ui-write-focus", route: writeRoute, steps: typeInFocus },
  { name: "ui-write-focus-left", route: writeRoute, steps: leaveFocus },
  {
    name: "ui-write-find",
    route: writeRoute,
    steps: async (page, ctx) => {
      await open(page, ctx);
      await page.getByTestId("write-find").fill("Tobias");
      // The count shows 0 until the first search frame runs, and Enter does nothing before then.
      await page.getByTestId("write-find-count").filter({ hasText: /^[1-9]\d*$/ }).waitFor();
      await page.getByTestId("write-find").press("Enter");
      await page.locator("[data-testid='write-find-count']:has-text(' of ')").waitFor();
    },
  },
  { name: "ui-write-replace", route: writeRoute, steps: (page, ctx) => openReplace(page, ctx, "Tobias", "Toby") },
  {
    name: "ui-write-replace-locked",
    route: writeRoute,
    steps: async (page, ctx) => {
      await openReplace(page, ctx, "midnight", "noon");
      await page.locator("[data-testid^='write-replace-item-']").filter({ hasText: "Locked: inside a cited passage" }).waitFor();
    },
  },
  { name: "ui-write-replaced", route: writeRoute, steps: replaceAll },
  {
    name: "ui-write-replaced-one",
    route: writeRoute,
    steps: async (page, ctx) => {
      await openReplace(page, ctx, "Tobias", "Toby");
      await page.getByTestId("write-replace-item-0").click();
      await page.getByTestId("write-replace-one").click();
      await page.getByTestId("editing-toast").filter({ hasText: "Replaced 1 in 1 scene" }).waitFor();
    },
  },
  {
    name: "ui-write-replace-draft",
    route: writeRoute,
    steps: async (page, ctx) => {
      await open(page, ctx);
      await page.getByTestId("write-find").fill("turned slowly");
      await page.getByTestId("write-replace-toggle").click();
      await page.getByTestId("write-replace-input").fill("spun");
      await page.getByTestId("write-replace-drafts").waitFor();
    },
  },
  {
    name: "ui-write-replace-undone",
    route: writeRoute,
    steps: async (page, ctx) => {
      await replaceAll(page, ctx);
      const undone = page.waitForResponse((r) => r.request().method() === "POST" && /\/replace\/undo$/.test(new URL(r.url()).pathname) && r.ok());
      await page.getByTestId("editing-toast-undo").click();
      await undone;
      await page.locator("[data-testid='write-replace-count']:has-text('match')").waitFor();
    },
  },
  { name: "ui-write-history", route: writeRoute12, steps: openHistory },
  {
    name: "ui-write-history-compare",
    route: writeRoute12,
    steps: async (page, ctx) => {
      await openHistory(page, ctx);
      await page.locator("[data-testid^='write-history-row-'][data-source='ai_apply']").click();
      await page.getByTestId("write-history-compare").waitFor();
      await page.locator("[data-testid='write-history-delta']:has-text('words')").waitFor();
    },
  },
  { name: "ui-write-history-confirm", route: writeRoute12, steps: confirmRestore },
  {
    name: "ui-write-history-restored",
    route: writeRoute12,
    steps: async (page, ctx) => {
      await confirmRestore(page, ctx);
      await page.getByTestId("write-history-confirm").click();
      await page.getByTestId("editing-toast").filter({ hasText: "Restored the version" }).waitFor();
      await page.locator("[data-testid^='write-history-row-'][data-source='restore']").first().waitFor();
    },
  },
  {
    name: "ui-write-history-undone",
    route: writeRoute12,
    steps: async (page, ctx) => {
      await confirmRestore(page, ctx);
      await page.getByTestId("write-history-confirm").click();
      await page.getByTestId("editing-toast").filter({ hasText: "Restored the version" }).getByTestId("editing-toast-undo").click();
      await page.locator("[data-testid^='write-history-row-'][data-source='restore']").nth(1).waitFor();
    },
  },
  { name: "ui-write-failed-save", route: writeRoute, steps: failSave },
  { name: "ui-write-failed-save-retried", route: writeRoute, steps: retrySave },
  {
    name: "ui-write-offline",
    route: writeRoute,
    steps: async (page, ctx) => {
      await open(page, ctx, "2.1");
      await page.context().setOffline(true);
      try {
        await typeAtEnd(page, ctx, "2.1", " Batch size is the strategy.");
        await leaveEditor(page);
        await page.locator("[data-testid='editing-save-status'][data-state='offline']").waitFor();
        await page.getByText("Offline · 1 change waiting").waitFor();
      } catch (error) {
        await page.context().setOffline(false);
        throw error;
      }
    },
  },
  {
    name: "ui-write-offline-back",
    route: writeRoute,
    steps: async (page, ctx) => {
      await open(page, ctx, "2.1");
      await page.context().setOffline(true);
      await typeAtEnd(page, ctx, "2.1", " Batch size is the strategy.");
      await leaveEditor(page);
      await page.locator("[data-testid='editing-save-status'][data-state='offline']").waitFor();
      await page.context().setOffline(false);
      await savedStatus(page).waitFor();
      await editorOf(page, ctx, "2.1").getByText("Batch size is the strategy.").waitFor();
    },
  },
  {
    name: "ui-write-updated-elsewhere",
    route: writeRoute,
    steps: async (page, ctx) => {
      const close = await updatedElsewhere(page, ctx);
      await close();
    },
  },
  {
    name: "ui-write-reloaded",
    route: writeRoute,
    steps: async (page, ctx) => {
      const close = await updatedElsewhere(page, ctx);
      await page.getByTestId("editing-save-status-reload").click();
      await savedStatus(page).waitFor();
      await editorOf(page, ctx, "2.1").getByText("One two three.").waitFor();
      await close();
    },
  },
  {
    name: "ui-write-label-picker",
    route: writeRoute12,
    steps: async (page, ctx) => {
      await open(page, ctx, "1.2");
      await page.getByTestId(`write-scene-label-add-${ctx.sceneIds["1.2"]}`).click();
      await page.locator("[data-testid^='editing-label-option-']").first().waitFor();
    },
  },
  {
    name: "ui-write-label-changed",
    route: writeRoute12,
    steps: async (page, ctx) => {
      await open(page, ctx, "1.2");
      await page.getByTestId(`write-scene-label-add-${ctx.sceneIds["1.2"]}`).click();
      const put = () => page.waitForResponse((r) => r.request().method() === "PUT" && /\/labels$/.test(new URL(r.url()).pathname) && r.ok());
      const added = put();
      await page.locator("[data-testid^='editing-label-option-']").filter({ hasText: "Ready to write" }).click();
      await added;
      const removed = put();
      await page.locator("[data-testid^='editing-label-option-']").filter({ hasText: "Needs research" }).click();
      await removed;
      const chips = page.getByTestId(`write-scene-label-${ctx.sceneIds["1.2"]}`);
      await chips.filter({ hasText: "Ready to write" }).waitFor();
      await chips.filter({ hasText: "Needs research" }).waitFor({ state: "detached" });
    },
  },
  {
    name: "ui-write-label-plan",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/plan`,
    steps: async (page, ctx) => {
      await open(page, ctx, "1.2");
      await page.getByTestId(`write-scene-label-add-${ctx.sceneIds["1.2"]}`).click();
      const put = () => page.waitForResponse((r) => r.request().method() === "PUT" && /\/labels$/.test(new URL(r.url()).pathname) && r.ok());
      const added = put();
      await page.locator("[data-testid^='editing-label-option-']").filter({ hasText: "Ready to write" }).click();
      await added;
      const removed = put();
      await page.locator("[data-testid^='editing-label-option-']").filter({ hasText: "Needs research" }).click();
      await removed;
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/plan`);
      await page.getByTestId(`plan-scene-${ctx.sceneIds["1.2"]}`).getByText("Ready to write").waitFor();
    },
  },
];
