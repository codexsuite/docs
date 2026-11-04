import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Working with Codex: writing with an agent. These shots show the app screens an agent works through and the decisions it leaves to you. */

const section = "auth-tokens-section";

async function createToken(page: Page): Promise<void> {
  await page.getByTestId(section).waitFor();
  await page.getByTestId(section).scrollIntoViewIfNeeded();
  await page.getByTestId("auth-token-name").fill("Claude Code for Salt and Signal");
  for (const scope of ["write", "references"]) {
    await page.getByTestId(`auth-token-scope-${scope}`).check();
  }
  await page.getByTestId("auth-token-expiry").selectOption({ label: "90 days" });
}

export const shots: ShotSpec[] = [
  {
    name: "work-agents-token",
    route: "/account",
    steps: createToken,
  },
  {
    name: "work-agents-draft",
    route: (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.2`,
    steps: async (page) => {
      await page.locator("[data-testid^='write-draft-apply-']").first().waitFor();
    },
  },
  {
    name: "work-agents-signoff",
    route: (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/references#${ctx.sourceIds["The Keeper's Ledger"]}`,
    steps: async (page) => {
      await page.getByTestId("refs-panel-title").waitFor();
      await page.getByTestId("refs-verdict-status").waitFor();
    },
  },
  {
    name: "work-agents-preflight",
    route: (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/layout`,
    steps: async (page) => {
      await page.getByTestId("layout-export-open").click();
      await page.getByTestId("layout-export-dialog").waitFor();
      await page.getByTestId("layout-export-verdict").waitFor();
    },
  },
];
