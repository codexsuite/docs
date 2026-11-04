import { crc32, inflateRawSync } from "node:zlib";
import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Print templates: the three built-ins, pinning, fork, download, upload and upgrade, all on Settings, Layout & print. */

const longWait = { timeout: 150_000 };
const forkSlug = "novel-6x9-fork";
const settingsRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/settings#layout`;
const card = (page: Page, slug: string) => page.getByTestId(`settings-layout-template-card-${slug}`);

/** Reads the files of a zip. Handles stored and deflated entries, which is all the app's download uses. */
function readZip(zip: Buffer): Map<string, Buffer> {
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("The download is not a zip file.");
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    if (!name.endsWith("/")) files.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/** Writes a zip with stored entries. */
function writeZip(files: Map<string, Buffer>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

/** Downloads a card's package through its Download link, as the browser would. */
async function downloadPackage(page: Page, slug: string): Promise<Map<string, Buffer>> {
  const href = await page.getByTestId(`settings-layout-template-download-${slug}`).getAttribute("href");
  if (href === null) throw new Error(`The ${slug} card has no download link.`);
  const response = await page.request.get(href);
  if (!response.ok()) throw new Error(`The package download answered ${response.status()}.`);
  return readZip(await response.body());
}

/** Changes template.json in a package and returns it as a zip. */
function edited(files: Map<string, Buffer>, change: (manifest: Record<string, any>) => void): Buffer {
  const copy = new Map(files);
  const manifest = JSON.parse(copy.get("template.json")!.toString("utf8")) as Record<string, any>;
  change(manifest);
  copy.set("template.json", Buffer.from(JSON.stringify(manifest, null, 2)));
  return writeZip(copy);
}

async function openTemplates(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(settingsRoute(ctx));
  await page.getByTestId("settings-layout-template").waitFor();
  await page.getByTestId("settings-layout-templates-toggle").click();
  await card(page, "novel-6x9").waitFor();
}

async function fork(page: Page, ctx: SeedResult): Promise<void> {
  await openTemplates(page, ctx);
  await page.getByTestId("settings-layout-template-fork-novel-6x9").click();
  await page.getByTestId("settings-layout-fork-dialog").waitFor();
  await page.getByTestId("settings-layout-fork-name").fill("Working Coasts novel");
  await page.getByTestId("settings-layout-fork-confirm").click();
  await card(page, forkSlug).waitFor();
}

/** Forks, pins the book to the fork, and uploads version 1.1.0 of it. The book is then offered the upgrade. */
async function upgradeOffered(page: Page, ctx: SeedResult): Promise<void> {
  await fork(page, ctx);
  await page.getByTestId(`settings-layout-template-use-${forkSlug}`).click();
  await page.waitForFunction(
    (slug) => (document.querySelector('[data-testid="settings-layout-template-pick"]') as HTMLSelectElement | null)?.value === slug,
    forkSlug,
  );
  const files = await downloadPackage(page, forkSlug);
  const zip = edited(files, (m) => {
    m.version = "1.1.0";
    m.page.margins.outer = 0.75;
    m.changelog = ["Outer margin is 0.75 in."];
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId(`settings-layout-template-upload-version-${forkSlug}`).click();
  await (await chooser).setFiles({ name: "working-coasts-novel-1.1.0.zip", mimeType: "application/zip", buffer: zip });
  await page.getByTestId("settings-layout-upgrade").waitFor();
}

/** Uploads a file through the Upload template button. */
async function uploadNew(page: Page, name: string, buffer: Buffer): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("settings-layout-template-upload").click();
  await (await chooser).setFiles({ name, mimeType: "application/zip", buffer });
}

export const shots: ShotSpec[] = [
  {
    name: "ui-templates-overview",
    route: settingsRoute,
    steps: async (page, ctx) => {
      await openTemplates(page, ctx);
      for (const slug of ["fantasy-rpg", "manuscript"]) await card(page, slug).waitFor();
      await page.getByTestId("settings-layout-templates").scrollIntoViewIfNeeded();
    },
  },
  {
    name: "ui-templates-pinned",
    route: settingsRoute,
    steps: async (page) => {
      await page.getByTestId("settings-layout-template").waitFor();
      await page.getByTestId("settings-layout-trim-6x9").waitFor();
    },
  },
  {
    name: "ui-templates-use",
    route: settingsRoute,
    steps: async (page, ctx) => {
      await openTemplates(page, ctx);
      await page.getByTestId("settings-layout-template-use-manuscript").click();
      await page.getByTestId("settings-layout-trim-us-letter").waitFor();
      await page.getByTestId("settings-layout-template-use-novel-6x9").waitFor();
    },
  },
  {
    name: "ui-templates-fork-dialog",
    route: settingsRoute,
    steps: async (page, ctx) => {
      await openTemplates(page, ctx);
      await page.getByTestId("settings-layout-template-fork-novel-6x9").click();
      await page.getByTestId("settings-layout-fork-dialog").waitFor();
      await page.getByTestId("settings-layout-fork-name").fill("Working Coasts novel");
    },
  },
  {
    name: "ui-templates-forked",
    route: settingsRoute,
    steps: fork,
  },
  {
    name: "ui-templates-download",
    route: settingsRoute,
    steps: async (page, ctx) => {
      await fork(page, ctx);
      const files = await downloadPackage(page, forkSlug);
      if (!files.has("template.json")) throw new Error("The downloaded package has no template.json.");
      await card(page, forkSlug).scrollIntoViewIfNeeded();
    },
  },
  {
    name: "ui-templates-upgrade-offer",
    route: settingsRoute,
    steps: upgradeOffered,
  },
  {
    name: "ui-templates-upgrade-preview",
    route: settingsRoute,
    steps: async (page, ctx) => {
      await upgradeOffered(page, ctx);
      await page.getByTestId("settings-layout-upgrade-preview").click();
      await page.getByTestId("settings-layout-preview-dialog").waitFor();
      await page.getByTestId("settings-layout-preview-page").waitFor(longWait);
    },
  },
  {
    name: "ui-templates-upgraded",
    route: settingsRoute,
    steps: async (page, ctx) => {
      await upgradeOffered(page, ctx);
      await page.getByTestId("settings-layout-upgrade-apply").click();
      await page.getByTestId("settings-layout-upgrade").waitFor({ state: "hidden" });
      await page.getByText("Pinned to v1.1.0").waitFor();
    },
  },
  {
    name: "ui-templates-upload-new",
    route: settingsRoute,
    steps: async (page, ctx) => {
      await openTemplates(page, ctx);
      const files = await downloadPackage(page, "novel-6x9");
      const zip = edited(files, (m) => {
        m.slug = "harbour-novel";
        m.name = "Harbour novel";
      });
      await uploadNew(page, "harbour-novel.zip", zip);
      await card(page, "harbour-novel").waitFor();
    },
  },
  {
    name: "ui-templates-upload-rejected",
    route: settingsRoute,
    steps: async (page, ctx) => {
      await openTemplates(page, ctx);
      await uploadNew(page, "notes.zip", Buffer.from("Chapter notes, not a package."));
      await page.getByTestId("settings-layout-template-error").waitFor();
    },
  },
  {
    name: "ui-templates-upload-rejected-slug",
    route: settingsRoute,
    steps: async (page, ctx) => {
      await openTemplates(page, ctx);
      const files = await downloadPackage(page, "novel-6x9");
      await uploadNew(page, "novel-6x9.zip", writeZip(files));
      await page.getByTestId("settings-layout-template-error").waitFor();
    },
  },
];
