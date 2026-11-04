/**
 * Captures screenshots of the app in both themes. Contract 10.
 *
 *   tsx scripts/shots/runner.ts --page <key|all> [--shot <prefix>] [--out <dir>] [--no-stack <baseUrl> --credentials <file>]
 *
 * It starts its own stack from the published images, so it needs Docker. Never run it on a host without Docker.
 * Use `pnpm shots:ci` to capture in hosted CI instead.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";
import sharp from "sharp";
import { signInFromFile } from "../lib/api.ts";
import { down, up } from "../lib/stack.ts";
import { restoreFixtures, seedDemo } from "./seed.ts";
import type { AdminSession, SeedResult, ShotSpec } from "./types.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const specsDir = join(repoRoot, "scripts/shots/specs");
const defaultOut = join(repoRoot, "src/assets/shots");

export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];
export const maxBytes = 150 * 1024;
export const viewport = { width: 1440, height: 900 };
/** The clock every page sees. */
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

/** Throws when the text contains one of the secrets. Names the shot, never the secret. */
export function assertNoSecrets(text: string, secrets: string[]): void {
  for (const secret of secrets) {
    if (secret.length >= 8 && text.includes(secret)) throw new Error("The capture log contains a credential. Remove the line that printed it.");
  }
}

export function specFiles(): string[] {
  return readdirSync(specsDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort();
}

/** Loads the specs of one page, or of every page, and checks names against all specs. */
export async function loadSpecs(page: string): Promise<ShotSpec[]> {
  const files = specFiles();
  const wanted = page === "all" ? files.filter((f) => !f.startsWith("_")) : [`${page}.ts`];
  if (page !== "all" && !files.includes(wanted[0]!)) throw new Error(`No spec for page "${page}": scripts/shots/specs/${page}.ts does not exist.`);
  const seen = new Map<string, string>();
  const chosen: ShotSpec[] = [];
  for (const file of files) {
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
  textHash: string;
  width: number;
  height: number;
}

/** One capture: a fresh browser context with the signed-in session copied in. */
async function capture(browser: Browser, session: AdminSession, seed: SeedResult, spec: ShotSpec, theme: Theme): Promise<Captured> {
  const context = await browser.newContext({
    viewport,
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: theme,
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
  });
  try {
    await context.addCookies(
      session.cookie.split("; ").map((pair) => {
        const i = pair.indexOf("=");
        return { name: pair.slice(0, i), value: pair.slice(i + 1), url: session.baseUrl };
      }),
    );
    await context.addInitScript((t) => window.localStorage.setItem("codex.theme", t), theme);
    const page = await context.newPage();
    await page.clock.setFixedTime(fixedTime);
    const route = typeof spec.route === "function" ? spec.route(seed) : spec.route;
    await page.goto(`${session.baseUrl}${route}`);
    await page.addStyleTag({
      content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
    });
    if (spec.steps) await spec.steps(page, seed);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    const shown = await page.evaluate(() => document.documentElement.dataset.theme);
    if (shown !== theme) throw new Error(`Shot "${spec.name}" showed theme "${shown}" instead of "${theme}".`);
    const text = await page.evaluate(() => document.body.innerText);
    const png = await page.screenshot({ clip: spec.clip, animations: "disabled", caret: "hide" });
    const webp = await encodeWebp(png, `${spec.name}-${theme}`);
    const meta = await sharp(webp).metadata();
    return { webp, textHash: createHash("sha256").update(text).digest("hex"), width: meta.width ?? 0, height: meta.height ?? 0 };
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
  try {
    // Sign in once. Every capture copies this session into a fresh context.
    const session = await signInFromFile(baseUrl, credentialsFile);
    const seed = await seedDemo(session);
    log(`Seeded the demo in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
    const browser = await chromium.launch();
    try {
      for (const spec of shots) {
        const hashes: string[] = [];
        for (const theme of themes) {
          await restoreFixtures(session, seed);
          const shot = await capture(browser, session, seed, spec, theme);
          hashes.push(shot.textHash);
          writeFileSync(join(options.out, `${spec.name}-${theme}.webp`), shot.webp);
          log(`${spec.name}-${theme}.webp ${shot.width}x${shot.height} ${(shot.webp.length / 1024).toFixed(1)} KB`);
        }
        if (hashes[0] !== hashes[1]) throw new Error(`Shot "${spec.name}" shows different text in light and dark. The fixtures were not restored.`);
      }
    } finally {
      await browser.close();
    }
    const credentials = JSON.parse(readFileSync(credentialsFile, "utf8")) as { adminPassword: string };
    assertNoSecrets(logLines.join("\n"), [session.cookie, credentials.adminPassword]);
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
