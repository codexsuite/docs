import type { Page } from "playwright";
import type { ShotSpec } from "../types.ts";

/** Guide: import a manuscript. Every shot starts at the Library, and the runner restores the snapshot afterwards. */

interface Piece {
  path: string;
  text: string;
}

/** A small invented Markdown folder in the layout the importer reads: acts, chapters and scenes as folders and files. */
const harbourLog: Piece[] = [
  { path: "harbour-log/manuscript/index.md", text: "---\ntitle: Harbour Log\nauthor: Mara Quill\n---\n" },
  { path: "harbour-log/manuscript/act-01-the-light/index.md", text: "---\ntitle: The Light\n---\n" },
  { path: "harbour-log/manuscript/act-01-the-light/chapter-01-the-lamp-room/index.md", text: "---\ntitle: The Lamp Room\n---\n" },
  {
    path: "harbour-log/manuscript/act-01-the-light/chapter-01-the-lamp-room/scene-01.md",
    text: "---\ntitle: The stair\nsummary: Orla climbs to the lamp room.\ncodex:\n  - Orla\n  - Fresnel lens\n---\n",
  },
  {
    path: "harbour-log/manuscript/act-01-the-light/chapter-01-the-lamp-room/scene-01-prose.md",
    text: "The stair had forty-one steps, and Orla counted every one.\n",
  },
  { path: "harbour-log/manuscript/act-01-the-light/chapter-02-low-water/index.md", text: "---\ntitle: Low Water\n---\n" },
  {
    path: "harbour-log/manuscript/act-01-the-light/chapter-02-low-water/scene-01.md",
    text: "---\ntitle: The marker\nsummary: The tide goes out past the last marker.\ncodex: [Orla]\n---\n",
  },
  { path: "harbour-log/manuscript/act-02-the-keepers/index.md", text: "---\ntitle: The Keepers\n---\n" },
  { path: "harbour-log/manuscript/act-02-the-keepers/chapter-03-the-ledger/index.md", text: "---\ntitle: The Ledger\n---\n" },
  {
    path: "harbour-log/manuscript/act-02-the-keepers/chapter-03-the-ledger/scene-01.md",
    text: "---\ntitle: First entry\nsummary: Orla reads the oldest page.\n---\n",
  },
  // Files the importer does not read, so the preview lists them as skipped.
  { path: "harbour-log/manuscript/cover-sketch.png", text: "not an image" },
  { path: "harbour-log/manuscript/notes.txt", text: "Ideas for later." },
];

/** A folder with no act folders in it, which the importer rejects. */
const noActs: Piece[] = [
  { path: "loose-notes/tides.md", text: "# Tides\n\nHigh water at six.\n" },
  { path: "loose-notes/lamp.md", text: "# Lamp\n\nThe oil runs low by midnight.\n" },
];

/** Opens the Import dialog and picks a source. */
async function openImport(page: Page, source: string): Promise<void> {
  await page.getByTestId("library-import").click();
  await page.getByTestId("library-import-dialog").waitFor();
  await page.getByTestId(`library-import-source-${source}`).click();
  await page.getByTestId("library-import-picker").waitFor();
}

/** The folder input takes only a directory path, so build the files in the page, give them folder paths and fire the change event. */
async function pickFolder(page: Page, pieces: Piece[]): Promise<void> {
  await page.getByTestId("library-import-file").evaluate((input: HTMLInputElement, files) => {
    const transfer = new DataTransfer();
    for (const piece of files) {
      const name = piece.path.slice(piece.path.lastIndexOf("/") + 1);
      const file = new File([piece.text], name, { type: "text/plain" });
      Object.defineProperty(file, "webkitRelativePath", { value: piece.path });
      transfer.items.add(file);
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, pieces);
  await page.getByTestId("library-import-file-name").waitFor();
}

/** Picks the folder, goes to step 2 and waits for the preview. */
async function previewHarbourLog(page: Page): Promise<void> {
  await openImport(page, "markdown");
  await pickFolder(page, harbourLog);
  await page.getByTestId("library-import-next").click();
  await page.getByTestId("import-preview").waitFor();
}

/** Runs the import and waits for the Plan with its banner. */
async function runImport(page: Page): Promise<void> {
  await previewHarbourLog(page);
  await page.getByTestId("import-run").click();
  await page.getByTestId("import-banner").waitFor();
}

export const shots: ShotSpec[] = [
  {
    name: "start-guides-import-overview",
    route: "/",
    steps: async (page) => {
      await runImport(page);
      await page.getByTestId("plan-board").waitFor();
    },
  },
  {
    name: "start-guides-import-sources",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("library-import").click();
      await page.getByTestId("library-import-dialog").waitFor();
      await page.getByTestId("library-import-source-markdown").click();
      await page.getByTestId("library-import-picker").waitFor();
    },
  },
  {
    name: "start-guides-import-picked",
    route: "/",
    steps: async (page) => {
      await openImport(page, "markdown");
      await pickFolder(page, harbourLog);
    },
  },
  {
    name: "start-guides-import-preview",
    route: "/",
    steps: async (page) => {
      await previewHarbourLog(page);
      await page.getByTestId("import-skipped").waitFor();
    },
  },
  {
    name: "start-guides-import-banner",
    route: "/",
    steps: async (page) => {
      await runImport(page);
      await page.getByTestId("import-banner-skipped").click();
      await page.getByTestId("import-banner-skipped-row").first().waitFor();
    },
  },
  {
    name: "start-guides-import-undo",
    route: "/",
    steps: async (page) => {
      await runImport(page);
      await page.getByTestId("import-undo").click();
      await page.getByTestId("import-undo-confirm").waitFor();
    },
  },
  {
    name: "start-guides-import-rejected",
    route: "/",
    steps: async (page) => {
      await openImport(page, "markdown");
      await pickFolder(page, noActs);
      await page.getByTestId("library-import-next").click();
      await page.getByTestId("import-preview-error").waitFor();
    },
  },
];
