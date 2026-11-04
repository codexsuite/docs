import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Guide: clear a quote for print. The quote is the Signals at Sea passage in scene 2.1, which is over the quote limit. */

const signals = "Signals at Sea";
const referencesRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/references`;
const sourceRoute = (ctx: SeedResult) => `${referencesRoute(ctx)}#${ctx.sourceIds[signals]}`;

/** Opens the Signals at Sea panel and waits for its verdict. */
async function openSource(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(sourceRoute(ctx));
  await page.getByTestId("refs-panel-title").waitFor();
  await page.getByTestId("refs-verdict-status").waitFor();
}

/** Withdraws the seeded draft so the source has no request, then waits for the Ask for permission button. */
async function withdrawDraft(page: Page, ctx: SeedResult): Promise<void> {
  await openSource(page, ctx);
  await page.getByTestId("refs-perm-withdraw").click();
  await page.getByTestId("refs-verdict-ask").waitFor();
}

/** Drafts the letter from the uses and waits for its text. */
async function draftLetter(page: Page, ctx: SeedResult): Promise<void> {
  await withdrawDraft(page, ctx);
  await page.getByTestId("refs-perm-draft").click();
  await page.getByTestId("refs-perm-letter").waitFor();
}

/** Addresses the letter and marks it sent. */
async function markSent(page: Page, ctx: SeedResult): Promise<void> {
  await draftLetter(page, ctx);
  await page.getByTestId("refs-perm-to").fill("permissions@tidewater.example");
  await page.getByTestId("refs-perm-send").click();
  await page.getByTestId("refs-perm-sent-label").waitFor();
}

export const shots: ShotSpec[] = [
  {
    name: "start-guides-clear-a-quote-overview",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await page.goto(referencesRoute(ctx));
      await page.getByTestId("refs-gate").waitFor();
      await page.getByTestId(`refs-row-${ctx.sourceIds[signals]}`).waitFor();
    },
  },
  {
    name: "start-guides-clear-a-quote-marker",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=2.1`,
    steps: async (page, ctx) => {
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=2.1`);
      await page.getByTestId(`write-marker-${ctx.useIds["signalsQuote"]}`).click();
      await page.getByTestId("write-marker-card").waitFor();
      await page.getByTestId("write-marker-card-words").waitFor();
    },
  },
  {
    name: "start-guides-clear-a-quote-count",
    route: sourceRoute,
    steps: async (page, ctx) => {
      await withdrawDraft(page, ctx);
      await page.getByTestId("refs-verdict-reason").filter({ hasText: "Quoted prose" }).waitFor();
    },
  },
  {
    name: "start-guides-clear-a-quote-letter",
    route: sourceRoute,
    steps: draftLetter,
  },
  {
    name: "start-guides-clear-a-quote-sent",
    route: sourceRoute,
    mask: ["[data-testid='refs-perm-sent-label']", "[data-testid='refs-perm-remind-label']"],
    steps: markSent,
  },
  {
    name: "start-guides-clear-a-quote-grant",
    route: sourceRoute,
    mask: ["[data-testid='refs-perm-sent-label']", "[data-testid='refs-perm-remind-label']"],
    steps: async (page, ctx) => {
      await markSent(page, ctx);
      await page.getByTestId("refs-perm-granted").click();
      await page.getByTestId("refs-perm-grant-form").waitFor();
      await page.getByTestId("refs-perm-file").setInputFiles({
        name: "okafor-letter.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 invented letter for the docs"),
      });
      await page.getByTestId("refs-perm-credit-input").fill("Quoted from Signals at Sea by R. Okafor, used by permission of Tidewater Review.");
    },
  },
  {
    name: "start-guides-clear-a-quote-granted",
    route: sourceRoute,
    mask: ["[data-testid='refs-perm-sent-label']", "[data-testid='refs-perm-responded-label']", "[data-testid='refs-perm-remind-label']"],
    steps: async (page, ctx) => {
      await markSent(page, ctx);
      await page.getByTestId("refs-perm-granted").click();
      await page.getByTestId("refs-perm-file").setInputFiles({
        name: "okafor-letter.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 invented letter for the docs"),
      });
      await page.getByTestId("refs-perm-credit-input").fill("Quoted from Signals at Sea by R. Okafor, used by permission of Tidewater Review.");
      await page.getByTestId("refs-perm-grant-submit").click();
      await page.getByTestId("refs-perm-attachment").waitFor();
    },
  },
];
