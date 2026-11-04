import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Research beside the draft: the Knowledge base on the Plan, an entry, where it is used, and the Sources list. */

const planRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/plan`;
const referencesRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/references`;
const entryRoute = (name: string) => (ctx: SeedResult) =>
  `${planRoute(ctx)}#kb=${ctx.entryIds[name]}&entry=${ctx.entryIds[name]}`;

async function openEntry(page: Page, ctx: SeedResult, name: string): Promise<void> {
  await page.goto(entryRoute(name)(ctx));
  await page.getByTestId("kb-entry-name").waitFor();
  await page.waitForFunction(
    (expected) => (document.querySelector("[data-testid='kb-entry-name']") as HTMLInputElement | null)?.value === expected,
    name,
  );
}

export const shots: ShotSpec[] = [
  {
    name: "work-research-sidebar",
    route: planRoute,
    steps: async (page, ctx) => {
      await page.goto(planRoute(ctx));
      await page.getByTestId("shell-kb-sidebar").waitFor();
      await page.getByTestId(`shell-kb-item-${ctx.entryIds["Edith Marrow"]}`).waitFor();
    },
  },
  {
    name: "work-research-new-entry",
    route: planRoute,
    steps: async (page, ctx) => {
      await page.goto(planRoute(ctx));
      await page.getByTestId("kb-new-entry").click();
      const name = page.getByTestId("kb-entry-draft-name");
      await name.fill("Harbour Board");
      await name.press("Enter");
      await page.waitForFunction(
        () => (document.querySelector("[data-testid='kb-entry-name']") as HTMLInputElement | null)?.value === "Harbour Board",
      );
    },
  },
  {
    name: "work-research-alias",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-add-alias").click();
      const input = page.getByTestId("kb-alias-input");
      await input.fill("Edie");
      await input.press("Enter");
      await page.getByTestId("kb-alias-Edie").waitFor();
    },
  },
  {
    name: "work-research-used-in",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-tab-used-in").click();
      await page.getByTestId("kb-used-in-tally").waitFor();
      await page.getByTestId(`kb-use-${ctx.sceneIds["1.1"]}`).waitFor();
    },
  },
  {
    name: "work-research-sources",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await page.goto(referencesRoute(ctx));
      await page.getByText("Signals at Sea").first().waitFor();
    },
  },
];
