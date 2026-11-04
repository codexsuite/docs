import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Guide: export a print-ready PDF. Salt and Signal starts with one copyright risk that blocks the export. */

const layoutRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/layout`;
const longWait = { timeout: 150_000 };

async function openLayout(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(layoutRoute(ctx));
  await page.getByTestId("layout-page").waitFor();
  await page.getByTestId("layout-template-select").waitFor();
}

async function openExport(page: Page, ctx: SeedResult): Promise<void> {
  await openLayout(page, ctx);
  await page.getByTestId("layout-export-open").click();
  await page.getByTestId("layout-export-dialog").waitFor();
  await page.getByTestId("layout-export-verdict").waitFor();
}

/** Clears the risk the way the clear-a-quote guide does: send the letter, then record the grant. */
async function grantPermission(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(`/books/${ctx.bookIds.saltAndSignal}/references#${ctx.sourceIds["Signals at Sea"]}`);
  await page.getByTestId("refs-perm-to").waitFor();
  await page.getByTestId("refs-perm-to").fill("permissions@tidewater.example");
  await page.getByTestId("refs-perm-send").click();
  await page.getByTestId("refs-perm-sent-label").waitFor();
  await page.getByTestId("refs-perm-granted").click();
  await page.getByTestId("refs-perm-file").setInputFiles({
    name: "okafor-letter.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 invented letter for the docs"),
  });
  await page.getByTestId("refs-perm-credit-input").fill("Quoted from Signals at Sea by R. Okafor, used by permission of Tidewater Review.");
  await page.getByTestId("refs-perm-grant-submit").click();
  await page.getByTestId("refs-perm-attachment").waitFor();
}

async function openReadyExport(page: Page, ctx: SeedResult): Promise<void> {
  await grantPermission(page, ctx);
  await openExport(page, ctx);
  await page.getByText("Ready to export").waitFor();
  await page.getByTestId("layout-export-bleed-0.125in").click();
  await page.getByTestId("layout-export-quality-print").click();
  await page.getByText("Ready to export").waitFor();
}

export const shots: ShotSpec[] = [
  {
    name: "start-guides-export-pdf-overview",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openLayout(page, ctx);
      await page.getByTestId("layout-status-pages").waitFor(longWait);
    },
  },
  {
    name: "start-guides-export-pdf-proof",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openLayout(page, ctx);
      await page.getByTestId("layout-mode-proof").click();
      await page.getByTestId("layout-proof-view").waitFor(longWait);
      await page.getByTestId("layout-proof-pages").waitFor(longWait);
    },
  },
  {
    name: "start-guides-export-pdf-preflight",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openLayout(page, ctx);
      await page.getByTestId("layout-tab-preflight").click();
      await page.getByTestId("layout-preflight-list").waitFor();
    },
  },
  {
    name: "start-guides-export-pdf-blocked",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openExport(page, ctx);
      await page.getByText("blocks export", { exact: false }).first().waitFor();
      await page.getByTestId("layout-export-draft").waitFor();
    },
  },
  {
    name: "start-guides-export-pdf-ready",
    route: layoutRoute,
    steps: openReadyExport,
  },
  {
    name: "start-guides-export-pdf-queued",
    route: layoutRoute,
    mask: ["[data-testid='layout-export-item']", "[data-testid='layout-export-running']"],
    steps: async (page, ctx) => {
      await openReadyExport(page, ctx);
      await page.getByTestId("layout-export-queue").click();
      await page.getByTestId("layout-tab-exports").click();
      await page.getByTestId("layout-export-done").waitFor(longWait);
    },
  },
];
