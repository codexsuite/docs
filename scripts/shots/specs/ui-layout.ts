import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Layout screen. Salt and Signal starts with one copyright risk, the Signals at Sea quote, so the first export is blocked. */

const longWait = { timeout: 150_000 };
const layoutRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/layout`;
const referencesRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/references`;
const exportItems = ["[data-testid='layout-export-item']", "[data-testid='layout-export-running']"];

async function openLayout(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(layoutRoute(ctx));
  await page.getByTestId("layout-page").waitFor();
  await page.getByTestId("layout-status-pages").waitFor();
  await page.getByTestId("layout-status-rendering").waitFor({ state: "hidden", ...longWait });
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

async function openReadyExport(page: Page, ctx: SeedResult): Promise<void> {
  await grantPermission(page, ctx);
  await openExport(page, ctx);
  await page.getByTestId("layout-export-bleed-0.125in").click();
  await page.getByTestId("layout-export-quality-print").click();
  await page.getByText("Ready to export").waitFor();
}

/** Queues a ready export and waits for it to finish in the Exports tab. */
async function exportDone(page: Page, ctx: SeedResult): Promise<void> {
  await openReadyExport(page, ctx);
  await page.getByTestId("layout-export-queue").click();
  await page.getByTestId("layout-tab-exports").click();
  await page.getByTestId("layout-export-done").waitFor(longWait);
}

/** Uploads a small image and places it in scene 1.1 as a figure, through the REST API. The runner restores the snapshot afterwards. */
async function addFigure(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(layoutRoute(ctx));
  await page.getByTestId("layout-page").waitFor();
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 300, height: 200 } });
  const upload = await page.request.post(`/api/books/${ctx.bookIds.saltAndSignal}/assets`, {
    headers: { "X-Codex-Client": "docs-shots" },
    multipart: { file: { name: "lamp-room.png", mimeType: "image/png", buffer: png } },
  });
  if (!upload.ok()) throw new Error(`asset upload failed with ${upload.status()}`);
  const assetId = ((await upload.json()) as { id: string }).id;
  await page.waitForFunction(
    async (id) => {
      const response = await fetch(`/api/assets/${id}/info`);
      const status = ((await response.json()) as { status: string }).status;
      if (status === "failed") throw new Error("asset processing failed");
      return status === "ready";
    },
    assetId,
    { polling: 500, timeout: 60_000 },
  );
  const sceneId = ctx.sceneIds["1.1"];
  const prose = await page.request.get(`/api/scenes/${sceneId}/prose`);
  if (!prose.ok()) throw new Error(`prose read failed with ${prose.status()}`);
  const { body, version } = (await prose.json()) as { body: string; version: number };
  const figureId = crypto.randomUUID();
  const placed = await page.request.post(`/api/scenes/${sceneId}/figures`, {
    data: {
      figureId,
      assetId,
      body: `${body}\n\n::figure{id="${figureId}"}\n`,
      version,
      placement: "column",
      caption: "The lamp room at dusk.",
      altText: "The lamp room at dusk.",
    },
  });
  if (!placed.ok()) throw new Error(`figure placement failed with ${placed.status()}`);
}

export const shots: ShotSpec[] = [
  {
    name: "ui-layout-overview",
    route: layoutRoute,
    steps: async (page, ctx) => openLayout(page, ctx),
  },
  {
    name: "ui-layout-scope",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openLayout(page, ctx);
      await page.getByTestId("layout-scope-select").selectOption("book");
      await page.getByTestId("layout-status-rendering").waitFor({ state: "hidden", ...longWait });
      await page.getByTestId("layout-status-pages").filter({ hasText: /pages$/ }).waitFor();
    },
  },
  {
    name: "ui-layout-spread",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openLayout(page, ctx);
      await page.getByTestId("layout-scope-select").selectOption("book");
      await page.getByTestId("layout-status-rendering").waitFor({ state: "hidden", ...longWait });
      await page.getByTestId("layout-status-pages").filter({ hasText: /pages$/ }).waitFor();
      await page.getByTestId("layout-zoom-select").selectOption("0.5");
      await page.getByTestId("layout-view-spread").click();
      await page.getByTestId("layout-view-spread").and(page.locator('[aria-pressed="true"]')).waitFor();
    },
  },
  {
    name: "ui-layout-option",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openLayout(page, ctx);
      await page.getByTestId("layout-option-toc").getByRole("button", { name: "On" }).click();
      await page.getByTestId("layout-option-toc").getByRole("button", { name: "On" }).and(page.locator('[aria-pressed="true"]')).waitFor();
      await page.getByTestId("layout-status-rendering").waitFor({ state: "hidden", ...longWait });
    },
  },
  {
    name: "ui-layout-block",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openLayout(page, ctx);
      await page.getByTestId("layout-canvas").locator("[data-scene]").first().click();
      await page.getByTestId("layout-block-card").waitFor();
      await page.getByTestId("layout-block-card").scrollIntoViewIfNeeded();
    },
  },
  {
    name: "ui-layout-figure-issue",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await addFigure(page, ctx);
      await openLayout(page, ctx);
      await page.getByTestId("layout-tab-issues").click();
      await page.getByTestId("layout-issue-item").first().waitFor();
    },
  },
  {
    name: "ui-layout-figure",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await addFigure(page, ctx);
      await openLayout(page, ctx);
      await page.getByTestId("layout-tab-issues").click();
      await page.getByTestId("layout-issue-item").first().waitFor();
      await page.getByTestId("layout-canvas").locator('[id^="fig-"]').first().click();
      await page.getByTestId("layout-block-card").waitFor();
      await page.getByTestId("layout-block-card").scrollIntoViewIfNeeded();
    },
  },
  {
    name: "ui-layout-issues",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openLayout(page, ctx);
      await page.getByTestId("layout-tab-issues").click();
      await page.getByTestId("layout-issues-list").waitFor();
    },
  },
  {
    name: "ui-layout-proof",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openLayout(page, ctx);
      await page.getByTestId("layout-mode-proof").click();
      await page.getByTestId("layout-proof-pages").waitFor(longWait);
      await page.getByTestId("layout-proof-banner").waitFor();
    },
  },
  {
    name: "ui-layout-proof-log",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openLayout(page, ctx);
      await page.getByTestId("layout-mode-proof").click();
      await page.getByTestId("layout-proof-pages").waitFor(longWait);
      await page.getByTestId("layout-proof-log-toggle").click();
      await page.getByTestId("layout-proof-log").waitFor();
    },
  },
  {
    name: "ui-layout-preflight",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openLayout(page, ctx);
      await page.getByTestId("layout-tab-preflight").click();
      await page.getByTestId("layout-preflight-list").waitFor();
      await page.getByTestId("layout-preflight-item").first().waitFor();
    },
  },
  {
    name: "ui-layout-export-blocked",
    route: layoutRoute,
    steps: async (page, ctx) => {
      await openExport(page, ctx);
      await page.getByTestId("layout-export-draft").waitFor();
      await page.getByTestId("layout-export-queue").and(page.locator(":disabled")).waitFor();
    },
  },
  {
    name: "ui-layout-export-draft",
    route: layoutRoute,
    mask: exportItems,
    steps: async (page, ctx) => {
      await openExport(page, ctx);
      await page.getByTestId("layout-export-draft").check();
      await page.getByTestId("layout-export-queue").and(page.locator(":enabled")).waitFor();
      await page.getByTestId("layout-export-queue").click();
      await page.getByTestId("layout-tab-exports").click();
      await page.getByTestId("layout-export-done").waitFor(longWait);
    },
  },
  {
    name: "ui-layout-export-ready",
    route: layoutRoute,
    steps: async (page, ctx) => openReadyExport(page, ctx),
  },
  {
    name: "ui-layout-exports",
    route: layoutRoute,
    mask: exportItems,
    steps: async (page, ctx) => exportDone(page, ctx),
  },
  {
    name: "ui-layout-export-again",
    route: layoutRoute,
    mask: exportItems,
    steps: async (page, ctx) => {
      await exportDone(page, ctx);
      await page.getByTestId("layout-export-again").click();
      await page.getByTestId("layout-export-dialog").waitFor();
      await page.getByTestId("layout-export-verdict").waitFor();
    },
  },
];
