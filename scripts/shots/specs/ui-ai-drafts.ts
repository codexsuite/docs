import type { Locator, Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Beats and AI drafts in Write: the beat card, its options, generating, the draft panel, Apply, Retry, Discard, Continue writing. */

const writeRoute = (scene: string) => (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=${scene}`;

const sceneBox = (page: Page, ctx: SeedResult, scene: string) => page.getByTestId(`write-scene-${ctx.sceneIds[scene]}`);
const editorOf = (page: Page, ctx: SeedResult, scene: string) => sceneBox(page, ctx, scene).getByTestId("prose-editor");
const savedStatus = (page: Page) => page.getByTestId("editing-save-status").and(page.locator("[data-state='saved']"));
const pendingDraft = (box: Locator) => box.locator("[data-testid^='write-draft-'][data-state='pending']");
const draftButton = (box: Locator, name: "apply" | "retry" | "discard" | "sent") => box.locator(`button[data-testid^='write-draft-${name}-']`);

async function open(page: Page, ctx: SeedResult, scene: string): Promise<void> {
  await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=${scene}`);
  await editorOf(page, ctx, scene).waitFor();
  await savedStatus(page).waitFor();
}

const isOk = (method: string, path: RegExp) => (r: { url(): string; request(): { method(): string }; ok(): boolean }) =>
  r.request().method() === method && path.test(new URL(r.url()).pathname) && r.ok();

/** Puts the caret on a new empty line at the end of the scene's text. */
async function caretOnNewLine(page: Page, ctx: SeedResult, scene: string): Promise<void> {
  await editorOf(page, ctx, scene).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
}

/** Types /scene on a new line, chooses Scene beat, and returns the new beat's id. */
async function insertBeat(page: Page, ctx: SeedResult, scene: string): Promise<string> {
  await caretOnNewLine(page, ctx, scene);
  const posted = page.waitForResponse(isOk("POST", /\/api\/scenes\/[^/]+\/beats$/));
  await page.keyboard.type("/scene");
  await page.getByTestId("prose-slash-item-scene-beat").click();
  const { beatId } = (await (await posted).json()) as { beatId: string };
  await sceneBox(page, ctx, scene).getByTestId(`write-beat-body-${beatId}`).waitFor();
  return beatId;
}

/** Types the instruction into the beat and leaves the field so Codex saves it. */
async function writeInstruction(page: Page, beatId: string, text: string): Promise<void> {
  const saved = page.waitForResponse(isOk("PATCH", new RegExp(`/api/beats/${beatId}$`)));
  await page.getByTestId(`write-beat-body-${beatId}`).fill(text);
  await page.getByTestId("write-manuscript").focus();
  await saved;
}

const instruction = "Tobias Venn explains to Edith Marrow why the Fresnel lens turns so slowly.";
const replyStart = "The lamp turned slowly";

/** A beat in scene 1.1 with its instruction saved. */
async function beatWithInstruction(page: Page, ctx: SeedResult): Promise<string> {
  await open(page, ctx, "1.1");
  const beatId = await insertBeat(page, ctx, "1.1");
  await writeInstruction(page, beatId, instruction);
  return beatId;
}

/** J5 steps 2 and 3: a target length and Tobias Venn as context. */
async function setLengthAndContext(page: Page, ctx: SeedResult): Promise<string> {
  const beatId = await beatWithInstruction(page, ctx);
  const length = page.getByTestId(`write-beat-length-${beatId}-400`);
  const lengthSaved = page.waitForResponse(isOk("PATCH", new RegExp(`/api/beats/${beatId}$`)));
  await length.click();
  await lengthSaved;
  await page.locator(`[data-testid='write-beat-length-${beatId}-400'][aria-pressed='true']`).waitFor();
  await page.getByTestId(`write-beat-context-add-${beatId}`).click();
  await page.getByTestId("write-beat-context-search").fill("Tobias");
  const contextSaved = page.waitForResponse(isOk("PUT", new RegExp(`/api/beats/${beatId}/context$`)));
  await page.getByTestId(`write-beat-context-option-${ctx.entryIds["Tobias Venn"]}`).click();
  await contextSaved;
  await page.getByTestId(`write-beat-context-${beatId}-${ctx.entryIds["Tobias Venn"]}`).waitFor();
  return beatId;
}

/** J5 step 4 up to the picker: opens the template and model list. */
async function openPicker(page: Page, ctx: SeedResult): Promise<string> {
  const beatId = await setLengthAndContext(page, ctx);
  await page.getByTestId(`write-beat-choice-${beatId}`).click();
  await page.getByTestId("write-draft-picker").waitFor();
  return beatId;
}

/** J5 step 4: chooses Write in Joel's voice and the fake model, then generates. */
async function generate(page: Page, ctx: SeedResult): Promise<string> {
  const beatId = await openPicker(page, ctx);
  await page.getByTestId("write-draft-template-joels-voice").click();
  await page.getByTestId(`write-draft-model-${ctx.aiIntegrationId}-fake-model`).click();
  await page.getByTestId("write-draft-picker").waitFor({ state: "detached" });
  await page.getByTestId(`write-beat-choice-${beatId}`).filter({ hasText: "Write in Joel's voice" }).waitFor();
  const generated = page.waitForResponse(isOk("POST", new RegExp(`/api/beats/${beatId}/generate$`)));
  await page.getByTestId(`write-beat-generate-${beatId}`).click();
  await generated;
  await pendingDraft(sceneBox(page, ctx, "1.1")).waitFor();
  await page.getByTestId(`write-draft-text-${beatId}`).filter({ hasText: replyStart }).waitFor();
  return beatId;
}

/** J5 step 5, first half: Retry makes attempt 2. */
async function retry(page: Page, ctx: SeedResult): Promise<string> {
  const beatId = await generate(page, ctx);
  const regenerated = page.waitForResponse(isOk("POST", new RegExp(`/api/beats/${beatId}/generate$`)));
  await page.getByTestId(`write-draft-retry-${beatId}`).click();
  await regenerated;
  await page.getByTestId(`write-draft-meta-${beatId}`).filter({ hasText: "attempt 2" }).waitFor();
  await pendingDraft(sceneBox(page, ctx, "1.1")).waitFor();
  return beatId;
}

/** J5 step 5, second half: Apply attempt 2. */
async function applyBeatDraft(page: Page, ctx: SeedResult): Promise<string> {
  const beatId = await retry(page, ctx);
  const applied = page.waitForResponse(isOk("POST", /\/api\/generations\/[^/]+\/apply$/));
  await page.getByTestId(`write-draft-apply-${beatId}`).click();
  await applied;
  await page.getByTestId(`write-draft-${beatId}`).waitFor({ state: "detached" });
  await editorOf(page, ctx, "1.1").getByText(replyStart).waitFor();
  await savedStatus(page).waitFor();
  return beatId;
}

/** J5 step 6: a hand edit after Apply. */
async function editByHand(page: Page, ctx: SeedResult): Promise<string> {
  const beatId = await applyBeatDraft(page, ctx);
  // The beat card fills the top of the editor and has fields of its own, so click in the last paragraph.
  const editor = editorOf(page, ctx, "1.1");
  const box = await editor.boundingBox();
  if (box === null) throw new Error("The editor of scene 1.1 is not on screen.");
  await editor.click({ position: { x: 12, y: box.height - 8 } });
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Tobias had counted them twice.");
  await page.locator("[data-testid='editing-save-status']:not([data-state='saved'])").waitFor();
  await page.getByTestId("write-manuscript").focus();
  await savedStatus(page).waitFor();
  await editorOf(page, ctx, "1.1").getByText("Tobias had counted them twice.").waitFor();
  return beatId;
}

/** J5 step 7: Format, then Scene beats, then Hide. */
async function hideBeats(page: Page, ctx: SeedResult): Promise<void> {
  const beatId = await editByHand(page, ctx);
  await page.getByTestId("write-format-button").click();
  await page.getByTestId("write-format-beats-hide").click();
  await page.locator("[data-testid='write-manuscript'][data-hide-beats='true']").waitFor();
  await page.keyboard.press("Escape");
  await page.getByTestId("write-format-popover").waitFor({ state: "detached" });
  await page.getByTestId(`write-beat-body-${beatId}`).waitFor({ state: "hidden" });
}

/** J1 steps 5 and 6: scene 1.2 has a pending draft. */
async function openPendingDraft(page: Page, ctx: SeedResult): Promise<Locator> {
  await open(page, ctx, "1.2");
  const box = sceneBox(page, ctx, "1.2");
  await pendingDraft(box).waitFor();
  await page.locator(`[data-testid='write-minimap-tick-${ctx.sceneIds["1.2"]}'][data-kind='pending']`).waitFor();
  return box;
}

async function applyPendingDraft(page: Page, ctx: SeedResult): Promise<Locator> {
  const box = await openPendingDraft(page, ctx);
  const applied = page.waitForResponse(isOk("POST", /\/api\/generations\/[^/]+\/apply$/));
  await draftButton(box, "apply").click();
  await applied;
  await pendingDraft(box).waitFor({ state: "detached" });
  await savedStatus(page).waitFor();
  await page.getByTestId("editing-toast").filter({ hasText: "Applied" }).waitFor();
  return box;
}

/** J6: an empty scene. Adds a scene to chapter 1 on the Plan, gives it a summary with a mention and a label, and opens it in Write. */
async function emptySceneOnPlan(page: Page, ctx: SeedResult): Promise<string> {
  await page.goto(`/books/${ctx.bookIds.saltAndSignal}/plan`);
  const chapter = page.getByTestId(`plan-chapter-${ctx.chapterIds["1"]}`);
  await chapter.waitFor();
  const titles = chapter.locator("[data-testid^='plan-scene-title-']");
  const before = await titles.count();
  await page.getByTestId(`plan-new-scene-${ctx.chapterIds["1"]}`).click();
  await titles.nth(before).waitFor();
  const id = (await titles.nth(before).getAttribute("data-testid"))!.replace("plan-scene-title-", "");
  const editor = chapter.locator("[contenteditable='true']:focus");
  await editor.waitFor();
  await page.keyboard.type("How Tobias Venn explained the @Fres");
  await page.getByTestId(`prose-mention-option-${ctx.entryIds["Fresnel lens"]}`).click();
  await page.keyboard.type(" to the new keeper.");
  const saved = page.waitForResponse(isOk("PATCH", new RegExp(`/api/scenes/${id}$`)));
  await page.getByTestId("plan-board").click({ position: { x: 4, y: 4 } });
  await saved;
  await page.getByTestId(`plan-scene-summary-${id}`).getByText("Fresnel lens").waitFor();
  return id;
}

async function labelEmptyScene(page: Page, id: string): Promise<void> {
  await page.getByTestId(`plan-scene-${id}`).hover();
  await page.getByTestId(`plan-scene-label-add-${id}`).click();
  const saved = page.waitForResponse(isOk("PUT", new RegExp(`/api/scenes/${id}/labels$`)));
  await page.locator("[data-testid^='editing-label-option-']").filter({ hasText: "Needs research" }).click();
  await saved;
  await page.getByTestId(`plan-scene-labels-${id}`).getByText("Needs research").waitFor();
  await page.keyboard.press("Escape");
}

async function openEmptySceneInWrite(page: Page, id: string): Promise<void> {
  await page.getByTestId(`plan-scene-${id}`).hover();
  await page.getByTestId(`plan-scene-more-${id}`).click();
  await page.getByTestId(`plan-scene-open-write-${id}`).click();
  await page.getByTestId(`write-scene-${id}`).getByTestId("prose-editor").waitFor();
  await savedStatus(page).waitFor();
}

async function beatInEmptyScene(page: Page, id: string): Promise<string> {
  await page.getByTestId(`write-scene-${id}`).getByTestId("prose-editor").click();
  const posted = page.waitForResponse(isOk("POST", /\/api\/scenes\/[^/]+\/beats$/));
  await page.keyboard.type("/scene");
  await page.getByTestId("prose-slash-item-scene-beat").click();
  const { beatId } = (await (await posted).json()) as { beatId: string };
  await writeInstruction(page, beatId, "Tobias Venn shows the new keeper how to read the lens and what to log.");
  return beatId;
}

export const shots: ShotSpec[] = [
  // J1 step 5 and the overview: the pending draft on scene 1.2.
  { name: "ui-ai-drafts-overview", route: writeRoute("1.2"), steps: async (page, ctx) => void (await openPendingDraft(page, ctx)) },
  // J1 step 6: Apply.
  { name: "ui-ai-drafts-applied", route: writeRoute("1.2"), steps: async (page, ctx) => void (await applyPendingDraft(page, ctx)) },
  {
    name: "ui-ai-drafts-apply-undone",
    route: writeRoute("1.2"),
    steps: async (page, ctx) => {
      const box = await applyPendingDraft(page, ctx);
      const undone = page.waitForResponse(isOk("POST", /\/api\/generations\/[^/]+\/undo-apply$/));
      await page.getByTestId("editing-toast-undo").click();
      await undone;
      await pendingDraft(box).waitFor();
    },
  },
  {
    name: "ui-ai-drafts-sent",
    route: writeRoute("1.2"),
    steps: async (page, ctx) => {
      const box = await openPendingDraft(page, ctx);
      await draftButton(box, "sent").click();
      await box.locator("[data-testid^='write-draft-sent-popover-']").getByText("Tokens:").waitFor();
    },
  },
  {
    name: "ui-ai-drafts-discarded",
    route: writeRoute("1.2"),
    steps: async (page, ctx) => {
      const box = await openPendingDraft(page, ctx);
      const discarded = page.waitForResponse(isOk("POST", /\/api\/generations\/[^/]+\/discard$/));
      await draftButton(box, "discard").click();
      await discarded;
      await pendingDraft(box).waitFor({ state: "detached" });
      await page.getByTestId("editing-toast").filter({ hasText: "Draft discarded" }).waitFor();
    },
  },
  {
    name: "ui-ai-drafts-discard-undone",
    route: writeRoute("1.2"),
    steps: async (page, ctx) => {
      const box = await openPendingDraft(page, ctx);
      await draftButton(box, "discard").click();
      await pendingDraft(box).waitFor({ state: "detached" });
      const undone = page.waitForResponse(isOk("POST", /\/api\/generations\/[^/]+\/undo-discard$/));
      await page.getByTestId("editing-toast-undo").click();
      await undone;
      await pendingDraft(box).waitFor();
    },
  },
  // J5 steps 1 to 7 on a new beat in scene 1.1.
  {
    name: "ui-ai-drafts-new-beat",
    route: writeRoute("1.1"),
    steps: async (page, ctx) => void (await beatWithInstruction(page, ctx)),
  },
  { name: "ui-ai-drafts-beat-options", route: writeRoute("1.1"), steps: async (page, ctx) => void (await setLengthAndContext(page, ctx)) },
  { name: "ui-ai-drafts-picker", route: writeRoute("1.1"), steps: async (page, ctx) => void (await openPicker(page, ctx)) },
  { name: "ui-ai-drafts-generated", route: writeRoute("1.1"), steps: async (page, ctx) => void (await generate(page, ctx)) },
  { name: "ui-ai-drafts-retried", route: writeRoute("1.1"), steps: async (page, ctx) => void (await retry(page, ctx)) },
  { name: "ui-ai-drafts-beat-applied", route: writeRoute("1.1"), steps: async (page, ctx) => void (await applyBeatDraft(page, ctx)) },
  { name: "ui-ai-drafts-hand-edit", route: writeRoute("1.1"), steps: async (page, ctx) => void (await editByHand(page, ctx)) },
  { name: "ui-ai-drafts-beats-hidden", route: writeRoute("1.1"), steps: hideBeats },
  // J6: fill an empty scene.
  {
    name: "ui-ai-drafts-empty-summary",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/plan`,
    steps: async (page, ctx) => {
      const id = await emptySceneOnPlan(page, ctx);
      await labelEmptyScene(page, id);
    },
  },
  {
    name: "ui-ai-drafts-empty-beat",
    route: writeRoute("1.1"),
    steps: async (page, ctx) => {
      const id = await emptySceneOnPlan(page, ctx);
      await labelEmptyScene(page, id);
      await openEmptySceneInWrite(page, id);
      await beatInEmptyScene(page, id);
    },
  },
  {
    name: "ui-ai-drafts-empty-generated",
    route: writeRoute("1.1"),
    steps: async (page, ctx) => {
      const id = await emptySceneOnPlan(page, ctx);
      await labelEmptyScene(page, id);
      await openEmptySceneInWrite(page, id);
      const beatId = await beatInEmptyScene(page, id);
      const generated = page.waitForResponse(isOk("POST", new RegExp(`/api/beats/${beatId}/generate$`)));
      await page.getByTestId(`write-beat-generate-${beatId}`).click();
      await generated;
      await page.getByTestId(`write-draft-text-${beatId}`).filter({ hasText: replyStart }).waitFor();
      await pendingDraft(page.getByTestId(`write-scene-${id}`)).waitFor();
    },
  },
  // Continue writing.
  {
    name: "ui-ai-drafts-continue",
    route: writeRoute("2.1"),
    steps: async (page, ctx) => {
      await open(page, ctx, "2.1");
      await caretOnNewLine(page, ctx, "2.1");
      await page.keyboard.type("/cont");
      const generated = page.waitForResponse(isOk("POST", /\/api\/scenes\/[^/]+\/continue$/));
      await page.getByTestId("prose-slash-item-continue-writing").click();
      await generated;
      await page.getByTestId(`write-draft-text-scene:${ctx.sceneIds["2.1"]}`).filter({ hasText: replyStart }).waitFor();
    },
  },
  // error:ai-not-configured, with the integration removed.
  {
    name: "ui-ai-drafts-not-configured",
    route: writeRoute("1.2"),
    steps: async (page, ctx) => {
      const removed = await page.request.delete(`/api/ai/integrations/${ctx.aiIntegrationId}`, { headers: { "x-codex-client": "docs" } });
      if (!removed.ok()) throw new Error(`DELETE /api/ai/integrations/{id} answered ${removed.status()}.`);
      await open(page, ctx, "1.2");
      await page.getByTestId("write-draft-connect").waitFor();
    },
  },
  // A reader with the view role sees the beat and no draft controls.
  {
    name: "ui-ai-drafts-viewer",
    route: writeRoute("1.2"),
    as: "viewer",
    steps: async (page, ctx) => {
      await open(page, ctx, "1.2");
      await sceneBox(page, ctx, "1.2").locator("[data-testid^='write-beat-body-']").waitFor();
    },
  },
];
