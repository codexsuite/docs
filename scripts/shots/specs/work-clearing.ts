import type { Locator, Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Working with Codex: clearing quotes and citing. Salt and Signal has the Signals at Sea quote in scene 2.1, over the limit. */

const signals = "Signals at Sea";
const referencesRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/references`;
const sourceRoute = (ctx: SeedResult) => `${referencesRoute(ctx)}#${ctx.sourceIds[signals]}`;
const sentMask = [
  "[data-testid='refs-perm-sent-label']",
  "[data-testid='refs-perm-responded-label']",
  "[data-testid='refs-perm-remind-label']",
  "[data-testid='refs-perm-followed-up-label']",
];
const quoteStart = "A signal station is judged by what it does";
const quoteEnd = "in the survey's phrase, no memory.";
const citedSentence = "The crates came off the train at Harrowmouth on a Tuesday.";

/** Opens the Signals at Sea panel and waits for its verdict. */
async function openSource(page: Page, ctx: SeedResult): Promise<void> {
  await page.goto(sourceRoute(ctx));
  await page.getByTestId("refs-panel-title").waitFor();
  await page.getByTestId("refs-verdict-status").waitFor();
}

/** Withdraws the seeded draft so the source has no request, then waits for Ask for permission. */
async function withdrawDraft(page: Page, ctx: SeedResult): Promise<void> {
  await openSource(page, ctx);
  await page.getByTestId("refs-perm-withdraw").click();
  await page.getByTestId("refs-verdict-ask").waitFor();
}

/** Addresses the letter and marks it sent. */
async function markSent(page: Page, ctx: SeedResult): Promise<void> {
  await withdrawDraft(page, ctx);
  await page.getByTestId("refs-perm-draft").click();
  await page.getByTestId("refs-perm-letter").waitFor();
  await page.getByTestId("refs-perm-to").fill("permissions@tidewater.example");
  await page.getByTestId("refs-perm-send").click();
  await page.getByTestId("refs-perm-sent-label").waitFor();
}

/** Records the grant with an invented letter and credit line. */
async function recordGrant(page: Page, ctx: SeedResult): Promise<void> {
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
}

/** From the sent state, sets the reminder to today so the reply counts as overdue. */
async function makeOverdue(page: Page, ctx: SeedResult): Promise<void> {
  await markSent(page, ctx);
  await page.getByTestId("refs-perm-remind").fill(new Date().toISOString().slice(0, 10));
  await page.getByTestId("refs-reminders-chip").waitFor();
  await page.getByTestId("refs-row-reminder").first().waitFor();
}

/** Selects the text from the start of `first` to the end of `last` in a scene's editor, and returns the editor. */
async function selectRange(page: Page, ctx: SeedResult, scene: string, first: string, last: string) {
  await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=${scene}`);
  const editor = page.getByTestId(`write-scene-${ctx.sceneIds[scene]}`).getByTestId("prose-editor");
  await editor.waitFor();
  await editor.click({ position: { x: 12, y: 8 } });
  await selectInEditor(editor, first, last);
  return editor;
}

/** Selects the text from the start of `first` to the end of `last` in an already open editor. */
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

/** Selects the sentence in scene 1.2, opens the slash menu over it and waits for the Source reference item. */
async function selectAndOpenMenu(page: Page, ctx: SeedResult): Promise<void> {
  await selectRange(page, ctx, "1.2", citedSentence, citedSentence);
  await page.keyboard.type("/source");
  await page.getByTestId("prose-slash-item-source-reference").waitFor();
}

/** Withdraws the draft, asks for the paraphrase beat and generates its draft. Returns the beat id. */
async function paraphraseDraft(page: Page, ctx: SeedResult): Promise<string> {
  await withdrawDraft(page, ctx);
  await page.getByTestId("refs-verdict-paraphrase").click();
  const beat = page.locator("[data-testid^='write-beat-body-']").filter({ hasText: "Paraphrase the passage quoted from Signals at Sea" });
  await beat.waitFor();
  const beatId = (await beat.first().getAttribute("data-testid"))!.replace("write-beat-body-", "");
  await page.getByTestId(`write-beat-generate-${beatId}`).click();
  await page.getByTestId(`write-draft-apply-${beatId}`).waitFor();
  return beatId;
}

export const shots: ShotSpec[] = [
  {
    name: "work-clearing-overview",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await page.goto(referencesRoute(ctx));
      await page.getByTestId("refs-gate").waitFor();
      await page.getByTestId(`refs-row-${ctx.sourceIds[signals]}`).waitFor();
    },
  },
  {
    name: "work-clearing-cite",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.2`,
    steps: async (page, ctx) => {
      await selectAndOpenMenu(page, ctx);
      await page.getByTestId("prose-slash-item-source-reference").click();
      await page.getByTestId("write-cite-picker").waitFor();
    },
  },
  {
    name: "work-clearing-marker",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=2.1`,
    steps: async (page, ctx) => {
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=2.1`);
      await page.getByTestId(`write-marker-${ctx.useIds["signalsQuote"]}`).click();
      await page.getByTestId("write-marker-card").waitFor();
      await page.getByTestId("write-marker-card-words").waitFor();
    },
  },
  {
    name: "work-clearing-over-limit",
    route: sourceRoute,
    steps: async (page, ctx) => {
      await withdrawDraft(page, ctx);
      await page.getByTestId("refs-verdict-reason").filter({ hasText: "Quoted prose" }).waitFor();
    },
  },
  {
    name: "work-clearing-letter",
    route: sourceRoute,
    steps: async (page, ctx) => {
      await withdrawDraft(page, ctx);
      await page.getByTestId("refs-perm-draft").click();
      await page.getByTestId("refs-perm-letter").waitFor();
    },
  },
  {
    name: "work-clearing-sent",
    route: sourceRoute,
    mask: sentMask,
    steps: markSent,
  },
  {
    name: "work-clearing-granted",
    route: sourceRoute,
    mask: sentMask,
    steps: recordGrant,
  },
  {
    name: "work-clearing-overdue",
    route: sourceRoute,
    mask: sentMask,
    steps: makeOverdue,
  },
  {
    name: "work-clearing-followed-up",
    route: sourceRoute,
    mask: sentMask,
    steps: async (page, ctx) => {
      await makeOverdue(page, ctx);
      await page.getByTestId("refs-perm-followed-up").click();
      await page.getByTestId("refs-perm-followed-up-label").waitFor();
    },
  },
  {
    name: "work-clearing-refused",
    route: sourceRoute,
    mask: sentMask,
    steps: async (page, ctx) => {
      await markSent(page, ctx);
      await page.getByTestId("refs-perm-refused").click();
      await page.getByTestId("refs-perm-refuse-note").fill("The Review does not license long extracts.");
      await page.getByTestId("refs-perm-refuse-submit").click();
      await page.getByTestId("refs-verdict-cut").waitFor();
    },
  },
  {
    name: "work-clearing-replace-letter",
    route: sourceRoute,
    mask: sentMask,
    steps: async (page, ctx) => {
      await recordGrant(page, ctx);
      await page.getByTestId("refs-perm-attachment-remove").click();
      await page.getByTestId("refs-perm-attachment-confirm").waitFor();
    },
  },
  {
    name: "work-clearing-paraphrase",
    route: sourceRoute,
    steps: async (page, ctx) => {
      await paraphraseDraft(page, ctx);
    },
  },
  {
    name: "work-clearing-paraphrased",
    route: sourceRoute,
    steps: async (page, ctx) => {
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
      await page.getByTestId(`write-cite-option-${ctx.sourceIds[signals]}`).click();
      await page.getByTestId("editing-save-status").and(page.locator("[data-state='saved']")).waitFor();
      await page.goto(sourceRoute(ctx));
      await page.getByTestId("refs-verdict-reason").filter({ hasText: "Ready to sign off" }).waitFor();
    },
  },
  {
    name: "work-clearing-snoozed",
    route: sourceRoute,
    mask: sentMask,
    steps: async (page, ctx) => {
      await makeOverdue(page, ctx);
      await page.getByTestId("refs-perm-remind-in-3").click();
      await page.getByTestId("refs-reminders-chip").waitFor({ state: "detached" });
    },
  },
  {
    name: "work-clearing-cleared",
    route: sourceRoute,
    mask: [...sentMask, "[data-testid='refs-signed-off']"],
    steps: async (page, ctx) => {
      await recordGrant(page, ctx);
      await page.getByTestId("refs-verdict-action").click();
      await page.getByTestId("refs-verdict-status").filter({ hasText: "Cleared" }).waitFor();
    },
  },
];
