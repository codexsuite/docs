import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Working with Codex: getting to print. Salt and Signal starts with one copyright risk, the Signals at Sea quote. */

const layoutRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/layout`;
const referencesRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/references`;
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

/** Sends the letter for Signals at Sea and records the grant, which lifts the only risk. */
async function grantPermission(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(`${referencesRoute(ctx)}#${ctx.sourceIds["Signals at Sea"]}`);
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

/** Picks APA and waits until the button reads as pressed. */
async function chooseApa(page: Page): Promise<void> {
  await page.getByTestId("settings-citation-style-apa").click();
  await page.getByTestId("settings-citation-style-apa").and(page.locator('[aria-pressed="true"]')).waitFor();
  await page.getByTestId("settings-citation-example").waitFor();
}

/** Opens the Export menu on the bibliography if it is not open. */
async function openExportMenu(page: Page): Promise<void> {
  if (!(await page.getByTestId("refs-export-permissions").isVisible())) await page.getByTestId("refs-export-toggle").click();
  await page.getByTestId("refs-export-permissions").waitFor();
  await page.getByTestId("refs-export-csljson").waitFor();
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
    name: "work-print-overview",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`,
    steps: async (page) => {
      // From Write, Preview in Layout continues on the Layout screen.
      await page.getByTestId("write-format-button").click();
      await page.getByTestId("write-format-preview").click();
      await page.getByTestId("layout-page").waitFor();
      await page.getByTestId("layout-status-pages").waitFor(longWait);
    },
  },
  {
    name: "work-print-template",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/settings#layout`,
    steps: async (page) => {
      await page.getByTestId("settings-layout-template").waitFor();
      await page.getByTestId("settings-layout-template").scrollIntoViewIfNeeded();
    },
  },
  {
    name: "work-print-blocked",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openExport(page, ctx);
      await page.getByText("blocks export", { exact: false }).first().waitFor();
      await page.getByTestId("layout-export-draft").waitFor();
    },
  },
  {
    name: "work-print-gate",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await grantPermission(page, ctx);
      await page.goto(referencesRoute(ctx));
      await page.getByText("Ready for print export").waitFor();
    },
  },
  {
    name: "work-print-bibliography",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await grantPermission(page, ctx);
      await page.goto(referencesRoute(ctx));
      await page.getByTestId("refs-view-bibliography").click();
      await page.getByTestId("refs-bib-entry").first().waitFor();
    },
  },
  {
    name: "work-print-citation-style",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/settings#citations`,
    steps: async (page) => {
      await page.getByTestId("settings-citation-style").waitFor();
      await chooseApa(page);
      await page.getByTestId("settings-citation-style").scrollIntoViewIfNeeded();
    },
  },
  {
    name: "work-print-bibliography-apa",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await grantPermission(page, ctx);
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/settings#citations`);
      await page.getByTestId("settings-citation-style").waitFor();
      await chooseApa(page);
      await page.goto(referencesRoute(ctx));
      await page.getByTestId("refs-view-bibliography").click();
      await page.waitForFunction(
        () => (document.querySelector('[data-testid="refs-bib-style"]') as HTMLSelectElement | null)?.value === "apa",
      );
      await page.getByTestId("refs-bib-entry").first().waitFor();
    },
  },
  {
    name: "work-print-publisher-export",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await grantPermission(page, ctx);
      await page.goto(referencesRoute(ctx));
      await page.getByTestId("refs-view-bibliography").click();
      await page.getByTestId("refs-bib-entry").first().waitFor();
      for (const [format, extension] of [["permissions", ".csv"], ["csljson", ".json"]] as const) {
        await openExportMenu(page);
        const download = page.waitForEvent("download");
        await page.getByTestId(`refs-export-${format}`).click();
        const name = (await download).suggestedFilename();
        if (!name.endsWith(extension)) throw new Error(`The ${format} export was named ${name}, not ${extension}.`);
      }
      await openExportMenu(page);
    },
  },
  {
    name: "work-print-write-preview",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`,
    steps: async (page) => {
      await page.getByTestId("write-format-button").click();
      await page.getByTestId("write-format-pane-show").click();
      await page.getByTestId("write-preview").waitFor();
      await page.getByTestId("write-preview-pages").waitFor(longWait);
    },
  },
  {
    name: "work-print-preflight",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openLayout(page, ctx);
      await page.getByTestId("layout-tab-preflight").click();
      await page.getByTestId("layout-preflight-list").waitFor();
    },
  },
  {
    name: "work-print-ready",
    route: layoutRoute,
    steps: openReadyExport,
  },
  {
    name: "work-print-exports",
    route: layoutRoute,
    mask: ["[data-testid='layout-export-item']", "[data-testid='layout-export-running']"],
    steps: async (page, ctx) => {
      await openReadyExport(page, ctx);
      await page.getByTestId("layout-export-queue").click();
      await page.getByTestId("layout-tab-exports").click();
      await page.getByTestId("layout-export-done").waitFor(longWait);
    },
  },
  {
    name: "work-print-draft",
    route: layoutRoute,
    mask: ["[data-testid='layout-export-item']", "[data-testid='layout-export-running']"],
    steps: async (page, ctx) => {
      await openExport(page, ctx);
      await page.getByTestId("layout-export-draft").check();
      await page.getByTestId("layout-export-queue").click();
      await page.getByTestId("layout-tab-exports").click();
      await page.getByTestId("layout-export-done").waitFor(longWait);
    },
  },
  {
    name: "work-print-proof",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openLayout(page, ctx);
      await page.getByTestId("layout-mode-proof").click();
      await page.getByTestId("layout-proof-pages").waitFor(longWait);
    },
  },
];
