import type { Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Research beside the draft: the Knowledge base on the Plan, an entry, where it is used, and the Sources list. */

const planRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/plan`;
const referencesRoute = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/references`;
const entryRoute = (name: string) => (ctx: SeedResult) =>
  `${planRoute(ctx)}#kb=${ctx.entryIds[name]}&entry=${ctx.entryIds[name]}`;

async function openEntry(page: Page, ctx: SeedResult, name: string): Promise<void> {
  await page.goto(entryRoute(name)(ctx));
  await page.getByTestId("kb-entry-name").waitFor();
  await page.waitForFunction(
    (expected) => (document.querySelector("[data-testid='kb-entry-name']") as HTMLInputElement | null)?.value === expected,
    name,
  );
}

const writeRoute = (scene: string) => (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=${scene}`;

/** Drags an entry from the sidebar onto a scene card on the Plan and waits for its chip. */
async function dragEntryToScene(page: Page, entryId: string, sceneId: string): Promise<void> {
  const item = page.getByTestId(`shell-kb-item-${entryId}`);
  await item.waitFor();
  const card = page.getByTestId(`plan-scene-${sceneId}`);
  await card.scrollIntoViewIfNeeded();
  await item.dragTo(card);
  await page.getByTestId(`plan-entry-${sceneId}-${entryId}`).waitFor();
}

async function waitSaved(page: Page): Promise<void> {
  await page.getByTestId("write-manuscript").focus();
  await page.waitForFunction(
    () => document.querySelector("[data-testid='editing-save-status']")?.getAttribute("data-state") === "saved",
  );
}

/** Opens Write on a scene and types words at the start of its text, then waits for the save. */
async function typeInScene(page: Page, ctx: SeedResult, scene: string, text: string): Promise<void> {
  await page.goto(writeRoute(scene)(ctx));
  const editor = page.getByTestId(`write-scene-${ctx.sceneIds[scene]}`).getByTestId("prose-editor");
  await editor.waitFor();
  await editor.click({ position: { x: 12, y: 8 } });
  await editor.evaluate((element) => {
    window.getSelection()?.collapse(element.firstElementChild, 0);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.keyboard.type(text);
  await waitSaved(page);
}

/** Selects one sentence of a scene, so the slash menu acts on it. */
async function selectSentence(page: Page, ctx: SeedResult, scene: string, sentence: string): Promise<void> {
  await page.goto(writeRoute(scene)(ctx));
  const editor = page.getByTestId(`write-scene-${ctx.sceneIds[scene]}`).getByTestId("prose-editor");
  await editor.waitFor();
  await editor.click({ position: { x: 12, y: 8 } });
  await editor.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: { node: Node; start: number }[] = [];
    let text = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      nodes.push({ node, start: text.length });
      text += node.textContent ?? "";
    }
    const at = text.indexOf(wanted);
    if (at < 0) throw new Error("The sentence is not in the scene.");
    const end = at + wanted.length;
    const from = nodes.filter((n) => n.start <= at).pop()!;
    const to = nodes.find((n) => end <= n.start + (n.node.textContent ?? "").length)!;
    window.getSelection()!.setBaseAndExtent(from.node, at - from.start, to.node, end - to.start);
    document.dispatchEvent(new Event("selectionchange"));
  }, sentence);
}

const addition = "From here Edith Marrow is head keeper and signs the logbook.";

/** Adds a Codex addition for Edith Marrow at the start of scene 1.1 and fills its note. */
async function addAddition(page: Page, ctx: SeedResult): Promise<void> {
  await typeInScene(page, ctx, "1.1", "/codex");
  await page.getByTestId("prose-slash-item-codex-addition").click();
  await page.getByTestId(`write-entry-picker-${ctx.entryIds["Edith Marrow"]}`).click();
  const body = page.locator("[data-testid^='write-addition-body-']").first();
  await body.waitFor();
  await body.fill(addition);
  await waitSaved(page);
}

export const shots: ShotSpec[] = [
  {
    name: "work-research-sidebar",
    route: planRoute,
    steps: async (page, ctx) => {
      await page.goto(planRoute(ctx));
      await page.getByTestId("shell-kb-sidebar").waitFor();
      await page.getByTestId(`shell-kb-item-${ctx.entryIds["Edith Marrow"]}`).waitFor();
    },
  },
  {
    name: "work-research-new-entry",
    route: planRoute,
    steps: async (page, ctx) => {
      await page.goto(planRoute(ctx));
      await page.getByTestId("kb-new-entry").click();
      const name = page.getByTestId("kb-entry-draft-name");
      await name.fill("Harbour Board");
      await name.press("Enter");
      await page.waitForFunction(
        () => (document.querySelector("[data-testid='kb-entry-name']") as HTMLInputElement | null)?.value === "Harbour Board",
      );
    },
  },
  {
    name: "work-research-alias",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-add-alias").click();
      const input = page.getByTestId("kb-alias-input");
      await input.fill("Edie");
      await input.press("Enter");
      await page.getByTestId("kb-alias-Edie").waitFor();
    },
  },
  {
    name: "work-research-used-in",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-tab-used-in").click();
      await page.getByTestId("kb-used-in-tally").waitFor();
      await page.getByTestId(`kb-use-${ctx.sceneIds["1.1"]}`).waitFor();
    },
  },
  {
    name: "work-research-sources",
    route: referencesRoute,
    steps: async (page, ctx) => {
      await page.goto(referencesRoute(ctx));
      await page.getByText("Signals at Sea").first().waitFor();
    },
  },
  {
    name: "work-research-linked",
    route: planRoute,
    steps: async (page, ctx) => {
      await page.goto(planRoute(ctx));
      await dragEntryToScene(page, ctx.entryIds["Harrowmouth"], ctx.sceneIds["1.2"]);
    },
  },
  {
    name: "work-research-underlined",
    route: writeRoute("1.1"),
    steps: async (page, ctx) => {
      await typeInScene(page, ctx, "1.1", "Mrs Marrow trimmed the wick. ");
      await page.getByTestId("write-kb-alias").first().waitFor();
    },
  },
  {
    name: "work-research-mention",
    route: writeRoute("1.1"),
    steps: async (page, ctx) => {
      await typeInScene(page, ctx, "1.1", "Mrs Marrow trimmed the wick. ");
      const alias = page.getByTestId("write-kb-alias").first();
      await alias.waitFor();
      const before = await page.getByTestId("write-kb-mention").count();
      await page.getByTestId(`shell-kb-item-${ctx.entryIds["Edith Marrow"]}`).dragTo(alias);
      await page.waitForFunction(
        (n) => document.querySelectorAll("[data-testid='write-kb-mention']").length > n,
        before,
      );
    },
  },
  {
    name: "work-research-addition",
    route: writeRoute("1.1"),
    steps: async (page, ctx) => {
      await addAddition(page, ctx);
      await page.getByTestId("prose-directive-kb-addition").first().waitFor();
    },
  },
  {
    name: "work-research-timeline",
    route: entryRoute("Edith Marrow"),
    steps: async (page, ctx) => {
      await addAddition(page, ctx);
      await openEntry(page, ctx, "Edith Marrow");
      await page.getByTestId("kb-tab-timeline").click();
      await page.locator("[data-testid^='kb-timeline-note-']").first().waitFor();
    },
  },
  {
    name: "work-research-beat-context",
    route: writeRoute("1.2"),
    steps: async (page, ctx) => {
      await page.goto(writeRoute("1.2")(ctx));
      const add = page.locator("[data-testid^='write-beat-context-add-']").first();
      await add.waitFor();
      await add.click();
      await page.getByTestId(`write-beat-context-option-${ctx.entryIds["Harrowmouth"]}`).click();
      await page.locator("[data-testid^='write-beat-context-'][data-testid$='" + ctx.entryIds["Harrowmouth"] + "']").first().waitFor();
    },
  },
  {
    name: "work-research-cite",
    route: writeRoute("1.1"),
    steps: async (page, ctx) => {
      await selectSentence(page, ctx, "1.1", "The lamp room was cold at five in the evening.");
      await page.keyboard.type("/source");
      await page.getByTestId("prose-slash-item-source-reference").click();
      await page.getByTestId("write-cite-picker").waitFor();
    },
  },
];
