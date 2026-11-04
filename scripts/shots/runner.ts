/**
 * Captures screenshots of the app in both themes. Contract 10.
 *
 *   tsx scripts/shots/runner.ts --page <key|all> [--shot <prefix>] [--out <dir>] [--no-stack <baseUrl> --credentials <file>]
 *
 * It starts its own stack from the published images, so it needs Docker. Never run it on a host without Docker.
 * Use `pnpm shots:ci` to capture in hosted CI instead.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";
import sharp from "sharp";
import { signInFromFile } from "../lib/api.ts";
import { down, up } from "../lib/stack.ts";
import { alwaysMasked, textHash } from "./compare.ts";
import { restoreFixtures, seedDemo } from "./seed.ts";
import { signInViewer } from "./viewer.ts";
import type { AdminSession, SeedResult, ShotSpec } from "./types.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const specsDir = join(repoRoot, "scripts/shots/specs");
const defaultOut = join(repoRoot, "src/assets/shots");

export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];
export const maxBytes = 150 * 1024;
export const viewport = { width: 1440, height: 900 };
/** The browser clock. The server renders its own dates from the real clock, so the comparison masks them. */
const fixedTime = new Date("2026-01-15T10:00:00Z");

export interface Options {
  page: string;
  shot?: string;
  out: string;
  noStack?: string;
  credentials?: string;
}

export function parseArgs(argv: string[]): Options {
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) throw new Error(`${flag} needs a value.`);
    return v;
  };
  const page = value("--page");
  if (!page) throw new Error("Usage: shots --page <key|all> [--shot <prefix>] [--out <dir>] [--no-stack <baseUrl> --credentials <file>]");
  const noStack = value("--no-stack");
  const credentials = value("--credentials") ?? process.env.CODEX_DOCS_CREDENTIALS;
  if (noStack && !credentials) throw new Error("--no-stack needs --credentials <file> (or CODEX_DOCS_CREDENTIALS), the 0600 JSON file with adminEmail and adminPassword.");
  return { page, shot: value("--shot"), out: resolve(value("--out") ?? defaultOut), noStack, credentials };
}

/** Encodes a PNG as webp, lowering the quality until the file is under the limit. Throws when it never fits. */
export async function encodeWebp(png: Buffer, name: string): Promise<Buffer> {
  for (let quality = 82; quality >= 40; quality -= 6) {
    const webp = await sharp(png).webp({ quality }).toBuffer();
    if (webp.length < maxBytes) return webp;
  }
  throw new Error(`${name} stays over ${maxBytes / 1024} KB even at quality 40.`);
}

/** Throws when the text contains one of the secrets. It never prints the secret. */
export function assertNoSecrets(text: string, secrets: string[]): void {
  for (const secret of secrets) {
    if (secret.length >= 8 && text.includes(secret)) throw new Error("The capture log contains a credential. Remove the line that printed it.");
  }
}

export function specFiles(): string[] {
  return readdirSync(specsDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort();
}

/** Loads the specs of one page, or of every page, and checks names across the loaded files. */
export async function loadSpecs(page: string): Promise<ShotSpec[]> {
  const files = specFiles();
  const wanted = page === "all" ? files.filter((f) => !f.startsWith("_")) : [`${page}.ts`];
  if (page !== "all" && !files.includes(wanted[0]!)) throw new Error(`No spec for page "${page}": scripts/shots/specs/${page}.ts does not exist.`);
  const seen = new Map<string, string>();
  const chosen: ShotSpec[] = [];
  // One page imports only its own file, so another page's mistake cannot fail this run. `pnpm test` checks every file.
  for (const file of page === "all" ? files : wanted) {
    const key = file.replace(/\.ts$/, "");
    const mod = (await import(pathToFileURL(join(specsDir, file)).href)) as { shots?: ShotSpec[] };
    if (!Array.isArray(mod.shots)) throw new Error(`${file} does not export "shots".`);
    for (const spec of mod.shots) {
      if (!spec.name.startsWith(key)) throw new Error(`Shot "${spec.name}" in ${file} must start with "${key}".`);
      const other = seen.get(spec.name);
      if (other) throw new Error(`Shot name "${spec.name}" is in both ${other} and ${file}.`);
      seen.set(spec.name, file);
      if (wanted.includes(file)) chosen.push(spec);
    }
  }
  return chosen;
}

function filterShots(specs: ShotSpec[], prefix: string | undefined): ShotSpec[] {
  const selected = prefix ? specs.filter((s) => s.name.startsWith(prefix)) : specs;
  if (selected.length === 0) throw new Error(prefix ? `No shot starts with "${prefix}".` : "The page has no shots.");
  return selected;
}

const logLines: string[] = [];
function log(message: string): void {
  logLines.push(message);
  console.log(message);
}

interface Captured {
  webp: Buffer;
  /** Hash of the page text with times and secrets masked. */
  textHash: string;
  width: number;
  height: number;
}

/** One capture: a fresh browser context with the signed-in session copied in. */
async function capture(browser: Browser, baseUrl: string, cookie: string, seed: SeedResult, spec: ShotSpec, theme: Theme): Promise<Captured> {
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport,
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: theme,
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  try {
    await context.addCookies(
      cookie.split("; ").map((pair) => {
        const i = pair.indexOf("=");
        return { name: pair.slice(0, i), value: pair.slice(i + 1), url: baseUrl };
      }),
    );
    await context.addInitScript((t) => window.localStorage.setItem("codex.theme", t), theme);
    const page = await context.newPage();
    await page.clock.setFixedTime(fixedTime);
    const route = typeof spec.route === "function" ? spec.route(seed) : spec.route;
    await page.goto(route);
    await page.addStyleTag({
      content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
    });
    if (spec.steps) await spec.steps(page, seed);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    const shown = await page.evaluate(() => document.documentElement.dataset.theme);
    if (shown !== theme) throw new Error(`Shot "${spec.name}" showed theme "${shown}" instead of "${theme}".`);
    const selectors = [...alwaysMasked, ...(spec.mask ?? [])];
    const { text, hidden } = await page.evaluate((masked) => {
      const parts = [...document.querySelectorAll(["time", ...masked].join(","))].map((el) => (el as HTMLElement).innerText ?? el.textContent ?? "");
      return { text: document.body.innerText, hidden: parts };
    }, selectors);
    const png = await page.screenshot({ clip: spec.clip, animations: "disabled", caret: "hide" });
    const webp = await encodeWebp(png, `${spec.name}-${theme}`);
    const meta = await sharp(webp).metadata();
    return { webp, textHash: textHash(text, hidden), width: meta.width ?? 0, height: meta.height ?? 0 };
  } finally {
    await context.close();
  }
}

export async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const shots = filterShots(await loadSpecs(options.page), options.shot);
  mkdirSync(options.out, { recursive: true });

  let baseUrl: string;
  let credentialsFile: string;
  if (options.noStack) {
    baseUrl = options.noStack;
    credentialsFile = options.credentials!;
  } else {
    const stack = await up({ override: true });
    baseUrl = stack.baseUrl;
    credentialsFile = stack.credentialsFile;
  }
  const started = Date.now();
  if (options.noStack) throw new Error("--no-stack cannot restore fixtures, because the restore copies the database and blobs of the stack that up() started. Run without it.");
  try {
    const credentials = JSON.parse(readFileSync(credentialsFile, "utf8")) as { adminPassword: string };
    // Sign in once. Every capture copies this session into a fresh context.
    const session = await signInFromFile(baseUrl, credentialsFile);
    const seed = await seedDemo(session);
    const secrets = [session.cookie, credentials.adminPassword];
    let viewerCookie: string | undefined;
    log(`Seeded the demo in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
    if (shots.some((s) => s.as === "viewer")) {
      const viewer = await signInViewer(session, seed.viewer.id);
      viewerCookie = viewer.cookie;
      secrets.push(...viewer.secrets);
      log("Signed in as the viewer.");
    }
    const browser = await chromium.launch();
    // A shot with steps may change data. The capture after it starts from restored fixtures. A plain shot changes nothing.
    let dirty = false;
    try {
      for (const spec of shots) {
        const hashes: string[] = [];
        for (const theme of themes) {
          if (dirty) {
            await restoreFixtures(session, seed);
            // The restore drops sessions made after the snapshot, so the viewer signs in again when a shot needs it.
            viewerCookie = undefined;
            dirty = false;
          }
          if (spec.as === "viewer" && !viewerCookie) {
            const viewer = await signInViewer(session, seed.viewer.id);
            viewerCookie = viewer.cookie;
            secrets.push(...viewer.secrets);
          }
          let shot: Captured;
          try {
            shot = await capture(browser, baseUrl, spec.as === "viewer" ? viewerCookie! : session.cookie, seed, spec, theme);
          } catch (error) {
            throw new Error(`Shot "${spec.name}" (${theme}) failed: ${error instanceof Error ? error.message : "unknown error"}`);
          }
          dirty = Boolean(spec.steps);
          hashes.push(shot.textHash);
          writeFileSync(join(options.out, `${spec.name}-${theme}.webp`), shot.webp);
          log(`${spec.name}-${theme}.webp ${shot.width}x${shot.height} ${(shot.webp.length / 1024).toFixed(1)} KB`);
        }
        if (hashes[0] !== hashes[1]) throw new Error(`Shot "${spec.name}" shows different text in light and dark after masking times and secrets. Mask the region that varies with "mask", or check that the step leaves the same state in both themes.`);
      }
    } finally {
      await browser.close();
    }
    assertNoSecrets(logLines.join("\n"), secrets);
    log(`Captured ${shots.length} shot(s) in both themes in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
  } finally {
    if (!options.noStack) down();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Capture failed.");
    process.exit(1);
  });
}
