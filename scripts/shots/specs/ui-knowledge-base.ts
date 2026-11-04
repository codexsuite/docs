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
];
