import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Guide: export a manuscript and back up a book. Every shot starts at the Archive & export card of Salt and Signal. */

const settingsRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/settings#archive`;
const longWait = { timeout: 150_000 };

async function openArchive(page: Page): Promise<void> {
  await page.getByTestId("settings-card-archive").waitFor();
  await page.getByTestId("settings-export-manuscript").scrollIntoViewIfNeeded();
}

async function openManuscriptDialog(page: Page): Promise<void> {
  await openArchive(page);
  await page.getByTestId("settings-export-manuscript").click();
  await page.getByTestId("settings-manuscript-dialog").waitFor();
  await page.getByTestId("settings-manuscript-risk").waitFor();
}

/** Queues a Word copy and waits for the job row to read Done. */
async function exportWord(page: Page): Promise<void> {
  await openManuscriptDialog(page);
  await page.getByTestId("settings-manuscript-submit").click();
  await page.getByTestId("settings-manuscript-job").waitFor();
  await page.getByTestId("settings-manuscript-download").waitFor(longWait);
}

/** Queues the backup and waits for its Download link. */
async function exportBackup(page: Page): Promise<void> {
  await openArchive(page);
  await page.getByTestId("settings-export-source").click();
  await page.getByTestId("settings-export-download").waitFor(longWait);
  await page.getByTestId("settings-export-notes").waitFor();
}

/** Downloads the backup the way the browser would and picks it in Library, Import. */
async function pickBackup(page: Page): Promise<void> {
  const href = await page.getByTestId("settings-export-download").getAttribute("href");
  const response = await page.request.get(new URL(href!, page.url()).toString());
  const buffer = Buffer.from(await response.body());
  await page.goto("/");
  await page.getByTestId("library-import").click();
  await page.getByTestId("library-import-dialog").waitFor();
  await page.getByTestId("library-import-source-codex_zip").click();
  await page.getByTestId("library-import-picker").waitFor();
  await page.getByTestId("library-import-file").setInputFiles({ name: "salt-and-signal.zip", mimeType: "application/zip", buffer });
  await page.getByTestId("library-import-file-name").waitFor();
}

export const shots: ShotSpec[] = [
  {
    name: "start-guides-back-up-overview",
    route: settingsRoute,
    steps: openArchive,
  },
  {
    name: "start-guides-back-up-manuscript",
    route: settingsRoute,
    steps: openManuscriptDialog,
  },
  {
    name: "start-guides-back-up-chapter",
    route: settingsRoute,
    steps: async (page) => {
      await openManuscriptDialog(page);
      await page.getByTestId("settings-manuscript-format-markdown").click();
      await page.getByTestId("settings-manuscript-scope").selectOption("chapter");
      await page.getByTestId("settings-manuscript-chapter").selectOption({ index: 1 });
      await page.getByTestId("settings-manuscript-summaries").check();
    },
  },
  {
    name: "start-guides-back-up-manuscript-done",
    route: settingsRoute,
    mask: ["[data-testid='settings-manuscript-job']"],
    steps: exportWord,
  },
  {
    name: "start-guides-back-up-backup-done",
    route: settingsRoute,
    steps: exportBackup,
  },
  {
    name: "start-guides-back-up-restore",
    route: settingsRoute,
    steps: async (page) => {
      await exportBackup(page);
      await pickBackup(page);
    },
  },
  {
    name: "start-guides-back-up-restore-preview",
    route: settingsRoute,
    steps: async (page) => {
      await exportBackup(page);
      await pickBackup(page);
      await page.getByTestId("library-import-next").click();
      await page.getByTestId("import-preview").waitFor();
    },
  },
  {
    name: "start-guides-back-up-restored",
    route: settingsRoute,
    steps: async (page) => {
      await exportBackup(page);
      await pickBackup(page);
      await page.getByTestId("library-import-next").click();
      await page.getByTestId("import-preview").waitFor();
      await page.getByTestId("import-run").click();
      await page.getByTestId("import-banner").waitFor();
    },
  },
];
