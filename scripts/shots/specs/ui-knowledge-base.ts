import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Knowledge base: the sidebar, the entry window, aliases, Used in, Timeline, rename, merge, delete and categories. */

const planRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/plan`;
const entryRoute = (name: string) => (ctx: SeedResult) =>
  `${planRoute(ctx)}#kb=${ctx.entryIds[name]}&entry=${ctx.entryIds[name]}`;

/** Opens the Plan with the sidebar listing the four seeded entries. */
async function openSidebar(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(planRoute(ctx));
  await page.getByTestId("shell-kb-sidebar").waitFor();
  await page.getByTestId(`shell-kb-item-${ctx.entryIds["Edith Marrow"]}`).waitFor();
}

/** Opens an entry's window by its address and waits for its name. */
async function openEntry(page: Page, ctx: SeedResult, name: string): Promise<void> {
  await page.goto(entryRoute(name)(ctx));
  await page.getByTestId("kb-entry-name").waitFor();
  await page.waitForFunction(
    (expected) => (document.querySelector("[data-testid='kb-entry-name']") as HTMLInputElement | null)?.value === expected,
    name,
  );
}

/** Drags an entry from the sidebar onto a scene card on the Plan and waits for its Linked chip. */
async function dragEntryToScene(page: Page, entryId: string, sceneId: string): Promise<void> {
  const item = page.getByTestId(`shell-kb-item-${entryId}`);
  await item.waitFor();
  const card = page.getByTestId(`plan-scene-${sceneId}`);
  await card.scrollIntoViewIfNeeded();
  await item.dragTo(card);
  await page.mouse.move(0, 0);
  await page.getByTestId(`plan-entry-${sceneId}-${entryId}`).waitFor();
}

/** Opens Write on a scene and types words at the start of its text, then waits for the save. */
async function typeInScene(page: Page, ctx: SeedResult, scene: string, text: string): Promise<void> {
  await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=${scene}`);
  const editor = page.getByTestId(`write-scene-${ctx.sceneIds[scene]}`).getByTestId("prose-editor");
  await editor.waitFor();
  await editor.click({ position: { x: 12, y: 8 } });
  await editor.evaluate((element) => {
    window.getSelection()?.collapse(element.firstElementChild, 0);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.keyboard.type(text);
  await page.mouse.move(0, 0);
  await page.getByTestId("write-manuscript").focus();
  await page.waitForFunction(
    () => document.querySelector("[data-testid='editing-save-status']")?.getAttribute("data-state") === "saved",
  );
}

/** Opens Write on scene 1.1, drags an entry from the sidebar onto the start of the text and waits for the mention and the save. */
async function dropMention(page: Page, ctx: SeedResult, name: string): Promise<void> {
  await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`);
  const editor = page.getByTestId(`write-scene-${ctx.sceneIds["1.1"]}`).getByTestId("prose-editor");
  await editor.waitFor();
  const before = await page.getByTestId("write-kb-mention").count();
  const targetPosition = await editor.evaluate((element) => {
    const node = element.querySelector("p")?.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) throw new Error("Scene text not found");
    const offset = node.textContent?.indexOf(" ") ?? -1;
    if (offset < 0) throw new Error("No word gap found");
    const range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(node, offset + 1);
    const gap = range.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return { x: gap.left + gap.width / 2 - bounds.left, y: gap.top + gap.height / 2 - bounds.top };
  });
  await page.getByTestId(`shell-kb-item-${ctx.entryIds[name]}`).dragTo(editor, { targetPosition });
  await page.mouse.move(0, 0);
  await page.waitForFunction(
    (n) => document.querySelectorAll("[data-testid='write-kb-mention']").length > n,
    before,
  );
  await page.waitForFunction(
    () => document.querySelector("[data-testid='editing-save-status']")?.getAttribute("data-state") === "saved",
  );
}

async function openMenu(page: Page): Promise<void> {
  await page.getByTestId("kb-entry-menu").click();
  await page.getByTestId("kb-entry-menu-delete").waitFor();
}

export const shots: ShotSpec[] = [
  {
    name: "ui-knowledge-base-overview",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-always-in-context").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-search",
    route: planRoute,
    steps: async (page, ctx) => {
      await openSidebar(page, ctx);
      await page.getByTestId("kb-search").fill("toby");
      await page.getByTestId(`shell-kb-item-${ctx.entryIds["Tobias Venn"]}`).waitFor();
      await page.getByTestId(`shell-kb-item-${ctx.entryIds["Edith Marrow"]}`).waitFor({ state: "detached" });
    },
  },
  {
    name: "ui-knowledge-base-filter",
    route: planRoute,
    steps: async (page, ctx) => {
      await openSidebar(page, ctx);
      await page.getByTestId("kb-filter").click();
      await page.getByTestId("kb-filter-panel").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-new-entry",
    route: planRoute,
    steps: async (page, ctx) => {
      await openSidebar(page, ctx);
      await page.getByTestId("kb-new-entry").click();
      await page.getByTestId("kb-entry-draft-name").fill("Nell Harker");
    },
  },
  {
    name: "ui-knowledge-base-new-entry-created",
    route: planRoute,
    steps: async (page, ctx) => {
      await openSidebar(page, ctx);
      await page.getByTestId("kb-new-entry").click();
      await page.getByTestId("kb-entry-draft-name").fill("Nell Harker");
      await page.getByTestId("kb-entry-draft-name").press("Enter");
      await page.getByTestId("kb-entry-name").waitFor();
      await page.getByTestId("kb-entry-summary").fill("The lamp-room cleaner who first saw the new beam.");
      await page.getByTestId("kb-entry-summary").blur();
    },
  },
  {
    name: "ui-knowledge-base-name-taken",
    route: planRoute,
    steps: async (page, ctx) => {
      await openSidebar(page, ctx);
      await page.getByTestId("kb-new-entry").click();
      await page.getByTestId("kb-entry-draft-name").fill("Harrowmouth");
      await page.getByTestId("kb-entry-draft-name").press("Enter");
      await page.getByTestId("kb-entry-draft-error").waitFor();
      await page.getByTestId("kb-entry-draft-create-anyway").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-alias-added",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-add-alias").click();
      await page.getByTestId("kb-alias-input").fill("Edie");
      await page.getByTestId("kb-alias-input").press("Enter");
      await page.getByTestId("kb-alias-Edie").waitFor();
      // The chip shows as soon as the save returns; the input closes after the warning check, so wait for it.
      await page.getByTestId("kb-alias-input").waitFor({ state: "detached" });
    },
  },
  {
    name: "ui-knowledge-base-alias-taken",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-add-alias").click();
      await page.getByTestId("kb-alias-input").fill("The Mouth");
      await page.getByTestId("kb-alias-input").press("Enter");
      await page.getByTestId("kb-alias-error").waitFor();
      await page.getByTestId("kb-alias-add-anyway").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-rename",
    route: entryRoute("Fresnel lens"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Fresnel lens");
      await page.getByTestId("kb-entry-name").fill("Fresnel optic");
      await page.getByTestId("kb-rename-keep-alias").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-used-in",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-tab-used-in").click();
      await page.getByTestId("kb-used-in-tally").waitFor();
      await page.getByTestId(`kb-use-${ctx.sceneIds["1.1"]}`).waitFor();
    },
  },
  {
    name: "ui-knowledge-base-timeline-add",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-tab-timeline").click();
      await page.getByTestId("kb-timeline-empty").waitFor();
      await page.getByTestId("kb-timeline-add").click();
      await page.getByTestId("kb-timeline-add-form").waitFor();
      await page.getByTestId("kb-timeline-add-text").fill("From here Edith is head keeper and signs the logbook.");
    },
  },
  {
    name: "ui-knowledge-base-timeline",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-tab-timeline").click();
      await page.getByTestId("kb-timeline-add").click();
      await page.getByTestId("kb-timeline-add-text").fill("From here Edith is head keeper and signs the logbook.");
      await page.getByTestId("kb-timeline-add-submit").click();
      await page.locator("[data-testid^='kb-timeline-note-']").first().waitFor();
    },
  },
  {
    name: "ui-knowledge-base-related",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-related-add").click();
      await page.getByTestId("kb-related-picker").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-merge",
    route: planRoute,
    steps: async (page, ctx) => {
      await openSidebar(page, ctx);
      const kb = await (await page.request.get(`/api/books/${ctx.bookIds.saltAndSignal}/kb`)).json();
      const places = kb.categories.find((c: { name: string }) => c.name === "Places");
      const made = await page.request.post(`/api/books/${ctx.bookIds.saltAndSignal}/kb/entries`, {
        data: { categoryId: places.id, name: "Harrow Mouth" },
      });
      const duplicate = await made.json();
      await page.goto(`${planRoute(ctx)}#kb=${duplicate.id}&entry=${duplicate.id}`);
      await page.getByTestId("kb-entry-name").waitFor();
      await openMenu(page);
      await page.getByTestId("kb-entry-menu-merge").click();
      await page.getByTestId("kb-merge-dialog").waitFor();
      await page.getByTestId(`kb-merge-option-${ctx.entryIds["Harrowmouth"]}`).click();
      await page.getByTestId("kb-merge-message").waitFor();
      await page.waitForFunction(() => !document.querySelector("[data-testid='kb-merge-message']")?.textContent?.includes("Checking"));
    },
  },
  {
    name: "ui-knowledge-base-delete",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await openMenu(page);
      await page.getByTestId("kb-entry-menu-delete").click();
      await page.getByTestId("kb-delete-dialog").waitFor();
      await page.waitForFunction(() => !document.querySelector("[data-testid='kb-delete-message']")?.textContent?.includes("Checking"));
    },
  },
  {
    name: "ui-knowledge-base-category-menu",
    route: planRoute,
    steps: async (page, ctx) => {
      await openSidebar(page, ctx);
      const heading = page.locator("[data-testid^='kb-category-'] h4").first();
      await heading.hover();
      await page.locator("[data-testid^='kb-category-menu-']").first().click();
      await page.getByTestId("kb-category-rename-input").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-rename-done",
    route: entryRoute("Fresnel lens"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Fresnel lens");
      await page.getByTestId("kb-entry-name").fill("Fresnel optic");
      await page.getByTestId("kb-rename-keep-alias").uncheck();
      await page.getByTestId("kb-entry-name").press("Enter");
      await page.getByTestId("kb-rename-keep-alias").waitFor({ state: "detached" });
    },
  },
  {
    name: "ui-knowledge-base-alias-warning",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-add-alias").click();
      await page.getByTestId("kb-alias-input").fill("the");
      await page.getByTestId("kb-alias-input").press("Enter");
      await page.getByTestId("kb-alias-warning").waitFor();
      await page.getByTestId("kb-alias-input").waitFor({ state: "detached" });
    },
  },
  {
    name: "ui-knowledge-base-category-chip",
    route: entryRoute("Fresnel lens"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Fresnel lens");
      await page.getByTestId("kb-category-chip").click();
      await page.getByTestId("kb-new-category-open").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-category-moved",
    route: entryRoute("Fresnel lens"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Fresnel lens");
      await page.getByTestId("kb-category-chip").click();
      await page.locator("[data-testid^='kb-category-option-']").filter({ hasText: "Places" }).click();
      await page.getByTestId("kb-category-chip").filter({ hasText: "Places" }).waitFor();
    },
  },
  {
    name: "ui-knowledge-base-new-category",
    route: entryRoute("Fresnel lens"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Fresnel lens");
      await page.getByTestId("kb-category-chip").click();
      await page.getByTestId("kb-new-category-open").click();
      await page.getByTestId("kb-new-category-name").fill("Tools");
      await page.locator("[data-testid^='kb-new-category-colour-']").nth(2).click();
    },
  },
  {
    name: "ui-knowledge-base-category-name-taken",
    route: entryRoute("Fresnel lens"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Fresnel lens");
      await page.getByTestId("kb-category-chip").click();
      await page.getByTestId("kb-new-category-open").click();
      await page.getByTestId("kb-new-category-name").fill("People");
      await page.getByTestId("kb-new-category-create").click();
      await page.getByTestId("kb-new-category-error").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-category-renamed",
    route: planRoute,
    steps: async (page, ctx) => {
      await openSidebar(page, ctx);
      await page.locator("[data-testid^='kb-category-'] h4").first().hover();
      await page.locator("[data-testid^='kb-category-menu-']").first().click();
      await page.locator("[data-testid^='kb-category-colour-']").nth(2).click();
      await page.getByTestId("kb-category-rename-input").fill("Characters");
      await page.getByTestId("kb-category-rename-save").click();
      await page.getByText("Characters", { exact: true }).first().waitFor();
    },
  },
  {
    name: "ui-knowledge-base-category-delete-blocked",
    route: planRoute,
    steps: async (page, ctx) => {
      await openSidebar(page, ctx);
      await page.locator("[data-testid^='kb-category-'] h4").first().hover();
      await page.locator("[data-testid^='kb-category-menu-']").first().click();
      await page.locator("[data-testid^='kb-category-delete-']").first().click();
      await page.getByTestId("kb-category-menu-error").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-always-in-context",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      const box = page.getByTestId("kb-always-in-context");
      if (!(await box.isChecked())) await box.click();
      await page.waitForFunction(
        () => (document.querySelector("[data-testid='kb-always-in-context']") as HTMLInputElement | null)?.checked === true,
      );
    },
  },
  {
    name: "ui-knowledge-base-related-linked",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-related-add").click();
      await page.getByTestId(`kb-related-option-${ctx.entryIds["Tobias Venn"]}`).click();
      await page.getByTestId(`kb-related-chip-${ctx.entryIds["Tobias Venn"]}`).waitFor();
    },
  },
  {
    name: "ui-knowledge-base-related-removed",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-related-add").click();
      await page.getByTestId(`kb-related-option-${ctx.entryIds["Tobias Venn"]}`).click();
      const chip = page.getByTestId(`kb-related-chip-${ctx.entryIds["Tobias Venn"]}`);
      await chip.waitFor();
      await chip.hover();
      await page.getByTestId(`kb-related-remove-${ctx.entryIds["Tobias Venn"]}`).click();
      await chip.waitFor({ state: "detached" });
    },
  },
  {
    name: "ui-knowledge-base-move-to-series",
    route: entryRoute("Fresnel lens"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Fresnel lens");
      await openMenu(page);
      await page.getByTestId("kb-entry-menu-promote").click();
      await page.getByTestId("kb-promote-dialog").waitFor();
      await page.getByTestId("kb-promote-message").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-moved-to-series",
    route: entryRoute("Fresnel lens"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Fresnel lens");
      await openMenu(page);
      await page.getByTestId("kb-entry-menu-promote").click();
      await page.getByTestId("kb-promote-confirm").click();
      await page.getByTestId("kb-entry-scope").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-drag-linked",
    route: planRoute,
    steps: async (page, ctx) => {
      await openSidebar(page, ctx);
      await dragEntryToScene(page, ctx.entryIds["Harrowmouth"], ctx.sceneIds["1.2"]);
    },
  },
  {
    name: "ui-knowledge-base-unlink",
    route: planRoute,
    steps: async (page, ctx) => {
      await openSidebar(page, ctx);
      await dragEntryToScene(page, ctx.entryIds["Harrowmouth"], ctx.sceneIds["1.2"]);
      await page.goto(entryRoute("Harrowmouth")(ctx));
      await page.getByTestId("kb-tab-used-in").click();
      await page.getByTestId(`kb-unlink-scene-${ctx.sceneIds["1.2"]}`).click();
      await page.getByText("Undo", { exact: true }).first().waitFor();
    },
  },
  {
    name: "ui-knowledge-base-make-mention",
    route: entryRoute("Edith Marrow"),
    mask: ["[data-testid='kb-used-in-tally']", "[data-testid^='kb-use-']"],
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-tab-used-in").click();
      const button = page.locator("[data-testid^='kb-make-mention-']").first();
      await button.waitFor();
      await button.click();
      await page.getByTestId("kb-used-in-tally").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-highlight-plan",
    route: planRoute,
    steps: async (page, ctx) => {
      await openSidebar(page, ctx);
      await page.getByTestId(`shell-kb-item-${ctx.entryIds["Edith Marrow"]}`).click();
      await page.locator("[data-testid^='plan-scene-'][data-emphasis='hit']").first().waitFor();
      await page.locator("[data-testid^='plan-scene-'][data-emphasis='dim']").first().waitFor();
      await page.getByTestId("kb-entry-window-close").click();
      await page.getByTestId("kb-entry-window").waitFor({ state: "detached" });
    },
  },
  {
    name: "ui-knowledge-base-highlight-write",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-tab-used-in").click();
      await page.getByTestId("kb-highlight-in-write").click();
      await page.getByTestId("write-highlight-chip").waitFor();
      await page.getByTestId("write-highlight-next").click();
    },
  },
  {
    name: "ui-knowledge-base-highlight-cleared",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-tab-used-in").click();
      await page.getByTestId("kb-highlight-in-write").click();
      await page.getByTestId("write-highlight-clear").click();
      await page.getByTestId("write-highlight-chip").waitFor({ state: "detached" });
    },
  },
  {
    name: "ui-knowledge-base-ctrl-click-mention",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`,
    steps: async (page, ctx) => {
      // The seed has no mention in the prose, so the step drops one in first.
      await dropMention(page, ctx, "Edith Marrow");
      const mention = page.getByTestId("write-kb-mention").first();
      await mention.waitFor();
      await mention.click({ modifiers: ["Control"] });
      await page.getByTestId("kb-entry-window").waitFor();
      await page.waitForFunction(() => (document.querySelector("[data-testid='kb-entry-name']") as HTMLInputElement | null)?.value === "Edith Marrow");
    },
  },
  {
    name: "ui-knowledge-base-alias-underline",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`,
    steps: async (page, ctx) => {
      await typeInScene(page, ctx, "1.1", "Mrs Marrow trimmed the wick. ");
      await page.getByTestId("write-kb-alias").first().waitFor();
    },
  },
  {
    name: "ui-knowledge-base-drag-mention",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`,
    steps: async (page, ctx) => {
      await dropMention(page, ctx, "Edith Marrow");
    },
  },
  {
    name: "ui-knowledge-base-write-addition",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`,
    steps: async (page, ctx) => {
      await typeInScene(page, ctx, "1.1", "/codex");
      await page.getByTestId("prose-slash-item-codex-addition").click();
      await page.getByTestId(`write-entry-picker-${ctx.entryIds["Edith Marrow"]}`).click();
      const body = page.locator("[data-testid^='write-addition-body-']").first();
      await body.fill("From here Edith is head keeper and signs the logbook.");
      const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/kb-additions/"));
      await page.getByTestId("write-manuscript").focus();
      await saved;
    },
  },
  {
    name: "ui-knowledge-base-beat-context",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.2`,
    steps: async (page, ctx) => {
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=1.2`);
      const add = page.locator("[data-testid^='write-beat-context-add-']").first();
      await add.waitFor();
      await add.click();
      await page.getByTestId(`write-beat-context-option-${ctx.entryIds["Harrowmouth"]}`).click();
      await page.locator("[data-testid^='write-beat-context-'][data-testid$='" + ctx.entryIds["Harrowmouth"] + "']").first().waitFor();
    },
  },
  {
    name: "ui-knowledge-base-merged",
    route: planRoute,
    steps: async (page, ctx) => {
      await openSidebar(page, ctx);
      const book = ctx.bookIds.saltAndSignal;
      const kb = await (await page.request.get(`/api/books/${book}/kb`)).json();
      const places = kb.categories.find((c: { name: string }) => c.name === "Places");
      const made = await page.request.post(`/api/books/${book}/kb/entries`, { data: { categoryId: places.id, name: "Harrow Mouth" } });
      const duplicate = await made.json();
      await page.goto(planRoute(ctx));
      await dragEntryToScene(page, duplicate.id, ctx.sceneIds["1.2"]);
      await page.goto(`${planRoute(ctx)}#kb=${duplicate.id}&entry=${duplicate.id}`);
      await page.getByTestId("kb-entry-name").waitFor();
      await openMenu(page);
      await page.getByTestId("kb-entry-menu-merge").click();
      await page.getByTestId(`kb-merge-option-${ctx.entryIds["Harrowmouth"]}`).click();
      await page.getByTestId("kb-merge-confirm").click();
      await page.getByText("Merged Harrow Mouth into Harrowmouth").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-deleted",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await openMenu(page);
      await page.getByTestId("kb-entry-menu-delete").click();
      await page.getByTestId("kb-delete-confirm").click();
      await page.getByText("Deleted Edith Marrow").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-timeline-edited",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-tab-timeline").click();
      await page.getByTestId("kb-timeline-add").click();
      await page.getByTestId("kb-timeline-add-text").fill("Edith signs the logbook.");
      await page.getByTestId("kb-timeline-add-submit").click();
      await page.locator("[data-testid^='kb-timeline-edit-']").first().click();
      await page.locator("[data-testid^='kb-timeline-edit-text-']").fill("Edith signs the logbook and trims the wick.");
      await page.locator("[data-testid^='kb-timeline-edit-save-']").click();
      await page.getByText("Edith signs the logbook and trims the wick.").waitFor();
    },
  },
  {
    name: "ui-knowledge-base-deleted-undone",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await openMenu(page);
      await page.getByTestId("kb-entry-menu-delete").click();
      await page.getByTestId("kb-delete-confirm").click();
      await page.getByTestId("editing-toast-undo").click();
      await page.getByTestId(`shell-kb-item-${ctx.entryIds["Edith Marrow"]}`).waitFor();
    },
  },
  {
    name: "ui-knowledge-base-category-deleted",
    route: entryRoute("Fresnel lens"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Fresnel lens");
      await page.getByTestId("kb-category-chip").click();
      await page.locator("[data-testid^='kb-category-option-']").filter({ hasText: "Places" }).click();
      await page.getByTestId("kb-category-chip").filter({ hasText: "Places" }).waitFor();
      await page.getByTestId("kb-entry-window-close").click();
      const heading = page.locator("[data-testid^='kb-category-']").filter({ has: page.getByRole("heading", { name: "Ideas" }) });
      await heading.hover();
      await heading.locator("[data-testid^='kb-category-menu-']").click();
      await heading.locator("[data-testid^='kb-category-delete-']").click();
      await page.getByText("Deleted category Ideas").waitFor();
    },
  },

];
