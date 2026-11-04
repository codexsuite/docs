import type { Locator, Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/**
 * References screen. The seed has two sources and no quote flags, so the steps add the rest through the REST API:
 * a signed-off Ledger, a quote under a licence that needs a fair-use decision, a source nobody cites and two unmarked quotes.
 * The runner restores a snapshot after every shot with steps.
 */

const ledger = "The Keeper's Ledger";
const signals = "Signals at Sea";
const beacon = "Beacon Keeping Notes";
const manual = "Lamp Trimming Manual";
const referencesRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/references`;
/** Ids of the sources the steps add, by title. addExtras fills it again after every restore. */
const extraIds: Record<string, string> = {};
const idOf = (ctx: SeedResult, title: string) => extraIds[title] ?? ctx.sourceIds[title];
const sourceRoute = (ctx: SeedResult, title: string) => `${referencesRoute(ctx)}#${idOf(ctx, title)}`;
const sentMask = [
  "[data-testid='refs-perm-sent-label']",
  "[data-testid='refs-perm-responded-label']",
  "[data-testid='refs-perm-remind-label']",
  "[data-testid='refs-perm-followed-up-label']",
  "[data-testid='refs-signed-off']",
  "[data-testid='refs-history']",
];
const quoteA = 'As the old keeper put it, "the lamp must never be left alone after dusk" and nobody argued.';
const quoteB = 'The board wrote that "every log entry needs an hour and a signature" in its yearly letter.';
const beaconQuote = "Keep the wick trimmed square and the glass clean.";
const citedSentence = "The crates came off the train at Harrowmouth on a Tuesday.";

async function call<T>(page: Page, method: string, path: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(path, { method, data: data ?? {} });
  if (!response.ok()) throw new Error(`${method} ${path} answered ${response.status()}.`);
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

interface Prose {
  body: string;
  version: number;
}

async function appendParagraph(page: Page, sceneId: string, paragraph: string): Promise<number> {
  const prose = await call<Prose>(page, "GET", `/api/scenes/${sceneId}/prose`);
  if (prose.body.includes(paragraph)) return prose.version;
  const body = `${prose.body.trimEnd()}\n\n${paragraph}`;
  return (await call<{ version: number }>(page, "PUT", `/api/scenes/${sceneId}/prose`, { body, version: prose.version })).version;
}

async function addSource(page: Page, ctx: SeedResult, title: string, licence: string, rightsHolder: string | null): Promise<string> {
  const added = await call<{ id: string | null; existingId: string | null }>(page, "POST", `/api/books/${ctx.bookIds.saltAndSignal}/references`, {
    details: {
      kind: "book",
      title,
      authorsText: "Penhallow, A.",
      year: 1949,
      publisher: "Harbour Press",
      edition: null,
      isbn: null,
      doi: null,
      url: null,
      accessedOn: null,
      licence,
      rightsHolder,
    },
    via: null,
  });
  const id = added.id ?? added.existingId;
  if (!id) throw new Error("Adding a source returned no id.");
  return id;
}

/** Cleared: the Ledger is signed off. Needs check: Beacon Keeping Notes (fair use not decided). Not cited: the Lamp Trimming Manual. Two unmarked quotes in scene 3.1. */
async function addExtras(page: Page, ctx: SeedResult): Promise<void> {
  await call(page, "POST", `/api/references/${ctx.sourceIds[ledger]}/sign-off`);
  const beaconId = await addSource(page, ctx, beacon, "cc_by_nc_4", "Harbour Press");
  extraIds[beacon] = beaconId;
  extraIds[manual] = await addSource(page, ctx, manual, "public_domain", null);
  const sceneId = ctx.sceneIds["1.2"] as string;
  const version = await appendParagraph(page, sceneId, beaconQuote);
  await call(page, "POST", "/api/citations", {
    sceneId,
    sourceId: beaconId,
    version,
    passage: beaconQuote,
    kind: "quote",
    locator: "p. 3",
  });
  const flagScene = ctx.sceneIds["3.1"] as string;
  await appendParagraph(page, flagScene, quoteA);
  await appendParagraph(page, flagScene, quoteB);
}

async function openWithExtras(page: Page, ctx: SeedResult): Promise<void> {
  await addExtras(page, ctx);
  await page.goto(referencesRoute(ctx));
  await page.getByTestId("refs-gate").waitFor();
  await page.getByTestId("refs-flag-inbox").waitFor();
}

async function openSource(page: Page, ctx: SeedResult, title: string): Promise<void> {
  await page.goto(sourceRoute(ctx, title));
  await page.getByTestId("refs-panel-title").waitFor();
  await page.getByTestId("refs-verdict-status").waitFor();
}

async function openWithExtrasSource(page: Page, ctx: SeedResult, title: string): Promise<void> {
  await addExtras(page, ctx);
  await openSource(page, ctx, title);
  await page.reload();
  await page.getByTestId("refs-verdict-status").waitFor();
}

async function openAdd(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(referencesRoute(ctx));
  await page.getByTestId("refs-add-open").click();
  await page.getByTestId("refs-add-form").waitFor();
}

async function openFlags(page: Page, ctx: SeedResult): Promise<void> {
  await openWithExtras(page, ctx);
  await page.getByTestId("refs-flag-inbox").click();
  await page.getByTestId("refs-flag-panel").waitFor();
}

const csl = JSON.stringify([
  { type: "book", title: "Lamps and Lenses", author: [{ family: "Venn", given: "T." }], issued: { "date-parts": [[1962]] }, publisher: "Harbour Press" },
  { type: "book", title: "The Fog Log", author: [{ family: "Marrow", given: "E." }], issued: { "date-parts": [[1971]] }, ISBN: "9780000000002" },
  { type: "book", title: ledger, author: [{ family: "Penhallow", given: "A." }], issued: { "date-parts": [[1931]] }, ISBN: "9780000000019" },
  { type: "book", author: [{ family: "Nobody", given: "N." }], issued: { "date-parts": [[1980]] } },
]);

async function pickImportFile(page: Page): Promise<void> {
  await page.getByTestId("refs-add-import-open").click();
  await page.getByTestId("refs-add-import-dialog").waitFor();
  await page.getByTestId("refs-add-import-file").setInputFiles({ name: "library.json", mimeType: "application/json", buffer: Buffer.from(csl) });
  await page.getByTestId("refs-add-import-summary").waitFor();
  await page.getByTestId("refs-add-import-summary").filter({ hasText: "2 new · 1 already in References · 1 skipped (no title)" }).waitFor();
}

/** Gives the Ledger an ISBN, so the import file's Ledger item matches it. */
async function setLedgerIsbn(page: Page, ctx: SeedResult): Promise<void> {
  await openSource(page, ctx, ledger);
  const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/references/"));
  await page.getByTestId("refs-field-isbn").fill("9780000000019");
  await page.getByTestId("refs-field-isbn").blur();
  await saved;
}

async function markSent(page: Page, ctx: SeedResult): Promise<void> {
  await openSource(page, ctx, signals);
  await page.getByTestId("refs-perm-withdraw").click();
  await page.getByTestId("refs-verdict-ask").waitFor();
  await page.getByTestId("refs-perm-draft").click();
  await page.getByTestId("refs-perm-letter").waitFor();
  await page.getByTestId("refs-perm-to").fill("permissions@tidewater.example");
  await page.getByTestId("refs-perm-send").click();
  await page.getByTestId("refs-perm-sent-label").waitFor();
}

async function makeOverdue(page: Page, ctx: SeedResult): Promise<void> {
  await markSent(page, ctx);
  await page.getByTestId("refs-perm-remind").fill(new Date().toISOString().slice(0, 10));
  await page.getByTestId("refs-reminders-chip").waitFor();
  await page.getByTestId("refs-row-reminder").first().waitFor();
}

const letter = {
  name: "okafor-letter.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4 invented letter for the docs"),
};

async function recordGrant(page: Page, ctx: SeedResult): Promise<void> {
  await markSent(page, ctx);
  await page.getByTestId("refs-perm-granted").click();
  await page.getByTestId("refs-perm-file").setInputFiles(letter);
  await page.getByTestId("refs-perm-credit-input").fill("Quoted from Signals at Sea by R. Okafor, used by permission of Tidewater Review.");
  await page.getByTestId("refs-perm-grant-submit").click();
  await page.getByTestId("refs-perm-attachment").waitFor();
}

async function refuse(page: Page, ctx: SeedResult): Promise<void> {
  await markSent(page, ctx);
  await page.getByTestId("refs-perm-refused").click();
  await page.getByTestId("refs-perm-refuse-note").fill("The Review does not license long extracts.");
  await page.getByTestId("refs-perm-refuse-submit").click();
  await page.getByTestId("refs-verdict-cut").waitFor();
}

async function selectIn(editor: Locator, text: string): Promise<void> {
  await editor.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: { node: Node; start: number }[] = [];
    let all = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      nodes.push({ node, start: all.length });
      all += node.textContent ?? "";
    }
    const at = all.indexOf(wanted);
    if (at < 0) throw new Error("The text is not in the scene.");
    const end = at + wanted.length;
    const from = nodes.filter((n) => n.start <= at).pop()!;
    const to = nodes.find((n) => end <= n.start + (n.node.textContent ?? "").length)!;
    window.getSelection()!.setBaseAndExtent(from.node, at - from.start, to.node, end - to.start);
    document.dispatchEvent(new Event("selectionchange"));
  }, text);
}

async function openCitePicker(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=1.2`);
  const editor = page.getByTestId(`write-scene-${ctx.sceneIds["1.2"]}`).getByTestId("prose-editor");
  await editor.waitFor();
  await editor.click({ position: { x: 12, y: 8 } });
  await selectIn(editor, citedSentence);
  await page.keyboard.type("/source");
  await page.getByTestId("prose-slash-item-source-reference").click();
  await page.getByTestId("write-cite-picker").waitFor();
}

/** Adds a copy of the Ledger, opens it and starts the merge. Returns the copy's id. */
async function mergeSteps(page: Page, ctx: SeedResult): Promise<string> {
  await addExtras(page, ctx);
  const copyId = await addSource(page, ctx, "Keepers Ledger (copy)", "public_domain", null);
  await page.goto(`${referencesRoute(ctx)}#${copyId}`);
  await page.reload();
  await page.getByTestId("refs-panel-title").filter({ hasText: "(copy)" }).waitFor();
  await page.getByTestId("refs-panel-menu").click();
  await page.getByTestId("refs-panel-menu-merge").click();
  await page.getByTestId("refs-merge-target").selectOption({ label: "The Keeper's Ledger (1931)" });
  await page.getByTestId("refs-merge-summary").waitFor();
  return copyId;
}

/** Withdraws the seeded draft on Signals at Sea so the source has no request. */
async function withdrawDraft(page: Page, ctx: SeedResult): Promise<void> {
  await openSource(page, ctx, signals);
  await page.getByTestId("refs-perm-withdraw").click();
  await page.getByTestId("refs-verdict-ask").waitFor();
}

/** Selects the text from the start of `first` to the end of `last` in an open editor. */
async function selectInEditor(editor: Locator, first: string, last: string): Promise<void> {
  await editor.evaluate(
    (element, [startText, endText]) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes: { node: Node; start: number }[] = [];
      let text = "";
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        nodes.push({ node, start: text.length });
        text += node.textContent ?? "";
      }
      const at = text.indexOf(startText);
      const lastAt = text.indexOf(endText, Math.max(at, 0));
      if (at < 0 || lastAt < 0) throw new Error("The text is not in the scene.");
      const end = lastAt + endText.length;
      const from = nodes.filter((n) => n.start <= at).pop()!;
      const to = nodes.find((n) => end <= n.start + (n.node.textContent ?? "").length)!;
      window.getSelection()!.setBaseAndExtent(from.node, at - from.start, to.node, end - to.start);
      document.dispatchEvent(new Event("selectionchange"));
      from.node.parentElement?.scrollIntoView({ block: "center" });
    },
    [first, last],
  );
}

const quoteStart = "A signal station is judged by what it does";
const quoteEnd = "in the survey's phrase, no memory.";

/** Withdraws the draft, asks for the paraphrase from the quote's use and generates the draft. Returns the beat id. */
async function paraphraseDraft(page: Page, ctx: SeedResult): Promise<string> {
  await withdrawDraft(page, ctx);
  await page.getByTestId(`refs-use-paraphrase-${ctx.useIds["signalsQuote"]}`).click();
  const beat = page.locator("[data-testid^='write-beat-body-']").filter({ hasText: "Paraphrase the passage quoted from Signals at Sea" });
  await beat.waitFor();
  const beatId = (await beat.first().getAttribute("data-testid"))!.replace("write-beat-body-", "");
  await page.getByTestId(`write-beat-generate-${beatId}`).click();
  await page.getByTestId(`write-draft-apply-${beatId}`).waitFor();
  return beatId;
}

/** Applies the draft, swaps the quote for a cited paraphrase and waits for Ready to sign off on the source. */
async function paraphrased(page: Page, ctx: SeedResult): Promise<void> {
  const beatId = await paraphraseDraft(page, ctx);
  const draft = await page.getByTestId(`write-draft-text-${beatId}`).innerText();
  const newText = draft.split(/\n+/).map((line) => line.trim()).filter(Boolean)[0]!;
  await page.getByTestId(`write-draft-apply-${beatId}`).click();
  await page.getByTestId(`write-draft-apply-${beatId}`).waitFor({ state: "detached" });
  await page.getByTestId("editing-save-status").and(page.locator("[data-state='saved']")).waitFor();
  await page.getByTestId(`write-marker-${ctx.useIds["signalsQuote"]}`).click();
  await page.getByTestId("write-cite-remove").click();
  await page.getByTestId(`write-marker-${ctx.useIds["signalsQuote"]}`).waitFor({ state: "detached" });
  const editor = page.getByTestId(`write-scene-${ctx.sceneIds["2.1"]}`).getByTestId("prose-editor");
  await editor.click({ position: { x: 12, y: 8 } });
  await selectInEditor(editor, quoteStart, quoteEnd);
  await page.keyboard.press("Backspace");
  await selectInEditor(editor, newText, newText);
  await page.keyboard.type("/source");
  await page.getByTestId("prose-slash-item-source-reference").click();
  const cited = page.waitForResponse((r) => r.request().method() === "POST" && /\/api\/.*cit/.test(new URL(r.url()).pathname));
  await page.getByTestId(`write-cite-option-${ctx.sourceIds[signals]}`).click();
  const response = await cited;
  if (!response.ok()) throw new Error(`The citation answered ${response.status()}.`);
  await page.locator("[data-testid^='write-marker-']").first().waitFor();
  await page.getByTestId("editing-save-status").and(page.locator("[data-state='saved']")).waitFor();
  await page.goto(sourceRoute(ctx, signals));
  await page.getByTestId("refs-verdict-reason").filter({ hasText: "Ready to sign off" }).waitFor();
}

/** Gives the Ledger our own address over http and re-checks it. The address redirects to https. */
async function recheck(page: Page, ctx: SeedResult): Promise<void> {
  await openSource(page, ctx, ledger);
  await page.getByTestId("refs-field-url").fill("http://codexsuite.app/");
  await page.getByTestId("refs-field-url").blur();
  await page.getByTestId("refs-recheck").click();
  await page.locator("[data-testid='refs-verify-url'][data-status='redirect']").waitFor();
}

/** Opens the New source detour from the cite picker. */
async function openNewSource(page: Page, ctx: SeedResult): Promise<void> {
  await openCitePicker(page, ctx);
  await page.getByTestId("write-cite-new-source").click();
  await page.getByTestId("refs-add-return-note").waitFor();
}

export const shots: ShotSpec[] = [
  {
    name: "ui-references-overview",
    route: referencesRoute,
    steps: openWithExtras,
  },
  {
    name: "ui-references-needs-check",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await openWithExtras(page, ctx);
      await page.getByTestId("refs-chip-needs_check").click();
      await page.getByTestId(`refs-row-${idOf(ctx, beacon)}`).waitFor();
    },
  },
  {
    name: "ui-references-bibliography",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await openWithExtras(page, ctx);
      await page.getByTestId("refs-view-bibliography").click();
      await page.getByTestId("refs-bibliography").waitFor();
      await page.getByTestId("refs-bib-style").selectOption({ label: "APA" });
      await page.getByTestId("refs-bib-entry").first().waitFor();
    },
  },
  {
    name: "ui-references-export",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await openWithExtras(page, ctx);
      await page.getByTestId("refs-view-bibliography").click();
      await page.getByTestId("refs-bib-entry").first().waitFor();
      await page.getByTestId("refs-export-toggle").click();
      await page.getByTestId("refs-export-bibtex").waitFor();
    },
  },
  // J9: cite a source while writing.
  {
    name: "ui-references-cite-picker",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.2`,
    steps: openCitePicker,
  },
  {
    name: "ui-references-cited",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.2`,
    steps: async (page, ctx) => {
      await openCitePicker(page, ctx);
      await page.getByTestId(`write-cite-option-${ctx.sourceIds[ledger]}`).click();
      await page.locator("[data-testid^='write-marker-']").filter({ hasText: /\d/ }).first().waitFor();
    },
  },
  {
    name: "ui-references-new-source",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await openNewSource(page, ctx);
      await page.getByTestId("refs-add-manual").click();
      await page.getByTestId("refs-add-field-title").fill("Fog Signals of the Northern Coast");
    },
  },
  {
    name: "ui-references-new-source-cited",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.2`,
    steps: async (page, ctx) => {
      await openNewSource(page, ctx);
      await page.getByTestId("refs-add-manual").click();
      await page.getByTestId("refs-add-field-title").fill("Fog Signals of the Northern Coast");
      await page.getByTestId("refs-add-save").click();
      await page.getByTestId("editing-toast").filter({ hasText: "Cited Fog Signals" }).waitFor();
    },
  },
  {
    name: "ui-references-use-existing",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await setLedgerIsbn(page, ctx);
      await openNewSource(page, ctx);
      await page.getByTestId("refs-add-input").fill("9780000000019");
      await page.getByTestId("refs-add-lookup").click();
      await page.getByTestId("refs-add-use-existing").waitFor();
    },
  },
  {
    name: "ui-references-add-lookup",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await openAdd(page, ctx);
      await page.getByTestId("refs-add-input").fill("10.5555/12345678");
    },
  },
  {
    name: "ui-references-add-doi",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await openAdd(page, ctx);
      await page.getByTestId("refs-add-input").fill("10.5555/12345678");
      await page.getByTestId("refs-add-lookup").click();
      await page.getByTestId("refs-panel-title").waitFor();
      await page.getByTestId("refs-field-doi").waitFor();
      await page.getByTestId("refs-field-doi").scrollIntoViewIfNeeded();
    },
  },
  {
    name: "ui-references-add-manual",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await openAdd(page, ctx);
      await page.getByTestId("refs-add-manual").click();
      await page.getByTestId("refs-add-manual-form").waitFor();
      await page.getByTestId("refs-add-field-title").fill("Fog Signals of the Northern Coast");
      await page.getByTestId("refs-add-field-year").fill("1954");
    },
  },
  {
    name: "ui-references-added",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await openAdd(page, ctx);
      await page.getByTestId("refs-add-manual").click();
      await page.getByTestId("refs-add-field-title").fill("Fog Signals of the Northern Coast");
      await page.getByTestId("refs-add-field-year").fill("1954");
      await page.getByTestId("refs-add-save").click();
      await page.getByTestId("refs-panel-title").filter({ hasText: "Fog Signals of the Northern Coast" }).waitFor();
    },
  },
  // J24: import, merge, edit and reopen, change a use, un-cite, remove.
  {
    name: "ui-references-import-preview",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await setLedgerIsbn(page, ctx);
      await page.goto(referencesRoute(ctx));
      await pickImportFile(page);
      await page.getByTestId("refs-add-import-skipped").waitFor();
    },
  },
  {
    name: "ui-references-imported",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await setLedgerIsbn(page, ctx);
      await page.goto(referencesRoute(ctx));
      await pickImportFile(page);
      await page.getByTestId("refs-add-import-submit").click();
      await page.getByTestId("refs-add-import-result").waitFor();
    },
  },
  {
    name: "ui-references-reopened",
    route: (ctx) => sourceRoute(ctx, ledger),
    mask: sentMask,
    steps: async (page, ctx) => {
      await addExtras(page, ctx);
      await openSource(page, ctx, ledger);
      await page.locator("[data-testid='refs-verdict-status']").filter({ hasText: "Cleared" }).waitFor();
      await page.getByTestId("refs-field-year").fill("1930");
      await page.getByTestId("refs-field-year").blur();
      await page.locator("[data-testid='refs-verdict-status']").filter({ hasText: "Needs check" }).waitFor();
    },
  },
  {
    name: "ui-references-merge",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await mergeSteps(page, ctx);
    },
  },
  {
    name: "ui-references-merged",
    route: referencesRoute,
    steps: async (page, ctx) => {
      const copyId = await mergeSteps(page, ctx);
      await page.getByTestId("refs-merge-confirm").click();
      await page.getByTestId(`refs-row-${copyId}`).waitFor({ state: "detached" });
      await page.getByTestId("editing-toast").filter({ hasText: "Merged" }).waitFor();
    },
  },
  {
    name: "ui-references-use-type",
    route: (ctx) => sourceRoute(ctx, ledger),
    steps: async (page, ctx) => {
      await addExtras(page, ctx);
      await openSource(page, ctx, ledger);
      await page.getByTestId(`refs-use-kind-${ctx.useIds["ledgerParaphrase"]}`).selectOption("quote");
      await page.locator("[data-testid='refs-verdict-status']").filter({ hasText: "Needs check" }).waitFor();
      await page.getByTestId(`refs-use-${ctx.useIds["ledgerParaphrase"]}`).scrollIntoViewIfNeeded();
    },
  },
  {
    name: "ui-references-cleared-again",
    route: (ctx) => sourceRoute(ctx, ledger),
    mask: sentMask,
    steps: async (page, ctx) => {
      await addExtras(page, ctx);
      await openSource(page, ctx, ledger);
      await page.getByTestId(`refs-use-kind-${ctx.useIds["ledgerParaphrase"]}`).selectOption("quote");
      await page.locator("[data-testid='refs-verdict-status']").filter({ hasText: "Needs check" }).waitFor();
      await page.getByTestId(`refs-use-${ctx.useIds["ledgerParaphrase"]}`).scrollIntoViewIfNeeded();
      await page.getByTestId("refs-verdict-action").click();
      await page.locator("[data-testid='refs-verdict-status']").filter({ hasText: "Cleared" }).waitFor();
    },
  },
  {
    name: "ui-references-recheck",
    route: (ctx) => sourceRoute(ctx, ledger),
    steps: async (page, ctx) => {
      await recheck(page, ctx);
    },
  },
  {
    name: "ui-references-recheck-updated",
    route: (ctx) => sourceRoute(ctx, ledger),
    steps: async (page, ctx) => {
      await recheck(page, ctx);
      await page.getByTestId("refs-update-address-url").click();
      await page.locator("[data-testid='refs-verify-url'][data-status='ok']").waitFor();
    },
  },
  {
    name: "ui-references-uncite",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`,
    steps: async (page, ctx) => {
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`);
      await page.getByTestId(`write-marker-${ctx.useIds["ledgerQuote"]}`).click();
      await page.getByTestId("write-marker-card").waitFor();
      await page.getByTestId("write-cite-remove").waitFor();
    },
  },
  {
    name: "ui-references-uncited",
    route: (ctx) => sourceRoute(ctx, ledger),
    steps: async (page, ctx) => {
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`);
      await page.getByTestId(`write-marker-${ctx.useIds["ledgerQuote"]}`).click();
      await page.getByTestId("write-cite-remove").click();
      await page.getByTestId(`write-marker-${ctx.useIds["ledgerQuote"]}`).waitFor({ state: "detached" });
      await page.goto(sourceRoute(ctx, ledger));
      await page.getByTestId("refs-panel-title").waitFor();
      await page.getByTestId(`refs-use-${ctx.useIds["ledgerQuote"]}`).waitFor({ state: "detached" });
    },
  },
  {
    name: "ui-references-remove",
    route: (ctx) => sourceRoute(ctx, ledger),
    steps: async (page, ctx) => {
      await openSource(page, ctx, ledger);
      await page.getByTestId("refs-panel-menu").click();
      await page.getByTestId("refs-panel-menu-remove").click();
      await page.getByTestId("refs-remove-confirm").waitFor();
    },
  },
  {
    name: "ui-references-removed",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await openSource(page, ctx, ledger);
      await page.getByTestId("refs-panel-menu").click();
      await page.getByTestId("refs-panel-menu-remove").click();
      await page.getByTestId("refs-remove-confirm").click();
      await page.getByTestId(`refs-row-${ctx.sourceIds[ledger]}`).waitFor({ state: "detached" });
    },
  },
  // J11: unflagged quotes, fair use and sign-off.
  {
    name: "ui-references-flags",
    route: referencesRoute,
    steps: openFlags,
  },
  {
    name: "ui-references-flag-dismissed",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await openFlags(page, ctx);
      await page.getByTestId("refs-flag-not-quote").first().click();
      await page.locator("[data-testid='refs-flag-excerpt']").nth(1).waitFor({ state: "detached" });
    },
  },
  {
    name: "ui-references-flag-other",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await openFlags(page, ctx);
      await page.getByTestId("refs-flag-other").first().click();
      await page.getByTestId("refs-flag-other-note").fill("Quoted from the harbour board's yearly letter.");
    },
  },
  {
    name: "ui-references-fair-use",
    route: (ctx) => sourceRoute(ctx, beacon),
    steps: async (page, ctx) => {
      await openWithExtrasSource(page, ctx, beacon);
      await page.getByTestId("refs-verdict-action").click();
      await page.getByTestId("refs-fair-use-reason").fill("Eight words, quoted to be discussed.");
    },
  },
  {
    name: "ui-references-signed-off",
    route: (ctx) => sourceRoute(ctx, beacon),
    mask: sentMask,
    steps: async (page, ctx) => {
      await openWithExtrasSource(page, ctx, beacon);
      await page.getByTestId("refs-verdict-action").click();
      await page.getByTestId("refs-fair-use-reason").fill("Eight words, quoted to be discussed.");
      await page.getByTestId("refs-fair-use-accept").click();
      await page.locator("[data-testid='refs-verdict-reason']").filter({ hasText: "Ready to sign off" }).waitFor();
      await page.getByTestId("refs-verdict-action").click();
      await page.getByTestId("refs-signed-off").waitFor();
    },
  },
  // J10 and the quote limit.
  {
    name: "ui-references-over-limit",
    route: (ctx) => sourceRoute(ctx, signals),
    steps: async (page, ctx) => {
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=2.1`);
      await page.getByTestId(`write-marker-${ctx.useIds["signalsQuote"]}`).click();
      await page.getByTestId("write-marker-card-open").click();
      await page.getByTestId("refs-panel-title").waitFor();
      await page.getByTestId("refs-perm-withdraw").click();
      await page.getByTestId("refs-verdict-ask").waitFor();
      await page.getByTestId("refs-verdict-reason").filter({ hasText: "Quoted prose" }).waitFor();
    },
  },
  {
    name: "ui-references-paraphrase-beat",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=2.1`,
    steps: async (page, ctx) => {
      await paraphraseDraft(page, ctx);
    },
  },
  {
    name: "ui-references-paraphrased",
    route: (ctx) => sourceRoute(ctx, signals),
    steps: paraphrased,
  },
  {
    name: "ui-references-paraphrase-cleared",
    route: (ctx) => sourceRoute(ctx, signals),
    mask: ["[data-testid='refs-signed-off']", "[data-testid='refs-history']"],
    steps: async (page, ctx) => {
      await paraphrased(page, ctx);
      await page.getByTestId("refs-verdict-action").click();
      await page.getByTestId("refs-verdict-status").filter({ hasText: "Cleared" }).waitFor();
    },
  },
  {
    name: "ui-references-marker-over-limit",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=2.1`,
    steps: async (page, ctx) => {
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=2.1`);
      await page.getByTestId(`write-marker-${ctx.useIds["signalsQuote"]}`).click();
      await page.getByTestId("write-marker-card").waitFor();
      await page.getByTestId("write-marker-card-words").waitFor();
    },
  },
  // J25: permission follow-up.
  {
    name: "ui-references-letter",
    route: (ctx) => sourceRoute(ctx, signals),
    steps: async (page, ctx) => {
      await openSource(page, ctx, signals);
      await page.getByTestId("refs-perm-withdraw").click();
      await page.getByTestId("refs-perm-draft").click();
      await page.getByTestId("refs-perm-letter").waitFor();
    },
  },
  {
    name: "ui-references-sent",
    route: (ctx) => sourceRoute(ctx, signals),
    mask: sentMask,
    steps: markSent,
  },
  {
    name: "ui-references-overdue",
    route: referencesRoute,
    mask: sentMask,
    steps: async (page, ctx) => {
      await makeOverdue(page, ctx);
      await page.goto(referencesRoute(ctx));
      await page.getByTestId("refs-reminders-chip").waitFor();
    },
  },
  {
    name: "ui-references-snooze",
    route: (ctx) => sourceRoute(ctx, signals),
    mask: sentMask,
    steps: async (page, ctx) => {
      await makeOverdue(page, ctx);
      await page.getByTestId("refs-perm-remind-in-7").click();
      await page.getByTestId("refs-reminders-chip").waitFor({ state: "detached" });
    },
  },
  {
    name: "ui-references-followed-up",
    route: (ctx) => sourceRoute(ctx, signals),
    mask: sentMask,
    steps: async (page, ctx) => {
      await makeOverdue(page, ctx);
      await page.getByTestId("refs-perm-followed-up").click();
      await page.getByTestId("refs-perm-followed-up-label").waitFor();
    },
  },
  {
    name: "ui-references-grant",
    route: (ctx) => sourceRoute(ctx, signals),
    mask: sentMask,
    steps: async (page, ctx) => {
      await markSent(page, ctx);
      await page.getByTestId("refs-perm-granted").click();
      await page.getByTestId("refs-perm-file").setInputFiles(letter);
      await page.getByTestId("refs-perm-credit-input").fill("Quoted from Signals at Sea by R. Okafor, used by permission of Tidewater Review.");
    },
  },
  {
    name: "ui-references-granted",
    route: (ctx) => sourceRoute(ctx, signals),
    mask: sentMask,
    steps: recordGrant,
  },
  {
    name: "ui-references-credit",
    route: referencesRoute,
    mask: sentMask,
    steps: async (page, ctx) => {
      await recordGrant(page, ctx);
      await page.goto(referencesRoute(ctx));
      await page.getByTestId("refs-view-bibliography").click();
      await page.getByTestId("refs-bib-credit").waitFor();
    },
  },
  {
    name: "ui-references-replace-letter",
    route: (ctx) => sourceRoute(ctx, signals),
    mask: sentMask,
    steps: async (page, ctx) => {
      await recordGrant(page, ctx);
      await page.getByTestId("refs-perm-attachment-remove").click();
      await page.getByTestId("refs-perm-attachment-confirm").waitFor();
    },
  },
  {
    name: "ui-references-replace-letter-new",
    route: (ctx) => sourceRoute(ctx, signals),
    mask: sentMask,
    steps: async (page, ctx) => {
      await recordGrant(page, ctx);
      await page.getByTestId("refs-perm-attachment-remove").click();
      await page.getByTestId("refs-perm-attachment-confirm").click();
      await page.getByTestId("refs-perm-attach-input").setInputFiles({ ...letter, name: "okafor-letter-v2.pdf" });
      await page.getByTestId("refs-perm-attachment").filter({ hasText: "okafor-letter-v2.pdf" }).waitFor();
    },
  },
  {
    name: "ui-references-refused",
    route: (ctx) => sourceRoute(ctx, signals),
    mask: sentMask,
    steps: refuse,
  },
  {
    name: "ui-references-cut",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=2.1`,
    mask: sentMask,
    steps: async (page, ctx) => {
      await refuse(page, ctx);
      await page.getByTestId("refs-verdict-cut").click();
      await page.getByTestId("write-marker-card").waitFor();
      await page.getByTestId("write-cite-remove").click();
      await page.getByTestId(`write-marker-${ctx.useIds["signalsQuote"]}`).waitFor({ state: "detached" });
    },
  },
  {
    name: "ui-references-ask-again",
    route: (ctx) => sourceRoute(ctx, signals),
    mask: sentMask,
    steps: async (page, ctx) => {
      await refuse(page, ctx);
      await page.getByTestId("refs-verdict-ask").click();
      await page.getByTestId("refs-perm-letter").waitFor();
    },
  },
];
