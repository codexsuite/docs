import type { Locator, Page } from "playwright";
import type { SeedResult, ShotSpec } from "../types.ts";

/** Settings, AI: providers and prompt templates. The last shot drives journey J22 from the settings page to the Write picker. */

const key = "fake-key-for-docs";
const fakeBase = "http://fake-model:4010/v1";
const copyName = "Lighthouse voice";

const open = async (page: Page) => {
  await page.goto("/settings/ai");
  await page.getByTestId("ai-page").waitFor();
  await page.getByTestId("ai-templates").waitFor();
  await page.locator("li[data-testid^='ai-row-']").first().waitFor();
};

const templateRow = (page: Page, name: string): Locator =>
  page.locator("[data-testid^='ai-template-row-']").filter({ hasText: name });

const providerRow = (page: Page, label: string): Locator =>
  page.locator("li[data-testid^='ai-row-']").filter({ hasText: label });

const fillConnect = async (page: Page, label: string, baseUrl: string) => {
  await page.getByTestId("ai-connect").click();
  await page.getByTestId("ai-connect-label").fill(label);
  await page.getByTestId("ai-connect-base-url").fill(baseUrl);
  await page.getByTestId("ai-connect-api-key").fill(key);
};

const duplicate = async (page: Page, source: string, name: string) => {
  await templateRow(page, source).getByRole("button", { name: "Duplicate" }).click();
  await page.getByTestId("ai-duplicate-name").fill(name);
  await page.getByTestId("ai-duplicate-save").click();
};

const connectAndSave = async (page: Page, label: string) => {
  await fillConnect(page, label, fakeBase);
  await page.getByTestId("ai-connect-test").click();
  await page.getByTestId("ai-connect-test-result").and(page.locator("[data-ok='true']")).waitFor();
  await page.getByTestId("ai-connect-save").click();
  await providerRow(page, label).waitFor();
};

/** Puts the caret on a new line at the end of scene 1.1, types /scene and chooses Scene beat. */
const insertBeat = async (page: Page, ctx: SeedResult) => {
  const scene = page.getByTestId(`write-scene-${ctx.sceneIds["1.1"]}`);
  const editor = scene.getByTestId("prose-editor");
  await editor.waitFor();
  await page.getByTestId("editing-save-status").and(page.locator("[data-state='saved']")).waitFor();
  const box = await editor.boundingBox();
  if (box === null) throw new Error("The editor of scene 1.1 is not on screen.");
  await editor.click({ position: { x: box.width - 4, y: box.height - 8 } });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve)));
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/scene");
  await page.getByTestId("prose-slash-item-scene-beat").click();
  const choice = scene.locator("[data-testid^='write-beat-choice-']");
  await choice.waitFor();
  return choice;
};

export const shots: ShotSpec[] = [
  {
    name: "ui-ai-settings-overview",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
    },
  },
  {
    name: "ui-ai-settings-connect",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await fillConnect(page, "Gateway", fakeBase);
    },
  },
  {
    name: "ui-ai-settings-connect-tested",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await fillConnect(page, "Gateway", fakeBase);
      await page.getByTestId("ai-connect-test").click();
      await page.getByTestId("ai-connect-test-result").and(page.locator("[data-ok='true']")).waitFor();
    },
  },
  {
    name: "ui-ai-settings-connect-failed",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      // The fake model has no /v2/models, so it answers 404 and the test fails.
      await fillConnect(page, "Gateway", "http://fake-model:4010/v2");
      await page.getByTestId("ai-connect-test").click();
      await page.getByTestId("ai-connect-test-result").and(page.locator("[data-ok='false']")).waitFor();
    },
  },
  {
    name: "ui-ai-settings-connected",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await connectAndSave(page, "Gateway");
    },
  },
  {
    name: "ui-ai-settings-test",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await providerRow(page, "Fake model").getByRole("button", { name: "Test" }).click();
      await page.locator("[data-testid^='ai-row-test-result-'][data-ok='true']").waitFor();
    },
  },
  {
    name: "ui-ai-settings-change-model",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await providerRow(page, "Fake model").getByRole("button", { name: "Test" }).click();
      await page.locator("[data-testid^='ai-row-test-result-'][data-ok='true']").waitFor();
      await providerRow(page, "Fake model").getByRole("button", { name: "Change default model" }).click();
      await page.locator("[data-testid^='ai-row-edit-input-']").waitFor();
    },
  },
  {
    name: "ui-ai-settings-replace-key",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await providerRow(page, "Fake model").getByRole("button", { name: "Replace key" }).click();
      const input = page.locator("[data-testid^='ai-row-edit-input-']");
      await input.fill("a-new-key-for-docs");
    },
  },
  {
    name: "ui-ai-settings-make-default",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await connectAndSave(page, "Gateway");
      await providerRow(page, "Gateway").getByRole("button", { name: "Make default" }).click();
      await providerRow(page, "Gateway").getByText("Default", { exact: true }).waitFor();
    },
  },
  {
    name: "ui-ai-settings-remove",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await providerRow(page, "Fake model").getByRole("button", { name: "Remove" }).click();
      await page.locator("[data-testid^='ai-row-remove-confirm-']").waitFor();
    },
  },
  {
    name: "ui-ai-settings-duplicate",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await templateRow(page, "Continue writing").getByRole("button", { name: "Duplicate" }).click();
      await page.getByTestId("ai-duplicate-name").fill(copyName);
    },
  },
  {
    name: "ui-ai-settings-duplicate-conflict",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await duplicate(page, "Continue writing", "Paraphrase");
      await page.getByTestId("ai-duplicate-error").waitFor();
    },
  },
  {
    name: "ui-ai-settings-editor",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await duplicate(page, "Continue writing", copyName);
      await page.getByTestId("ai-editor").waitFor();
    },
  },
  {
    name: "ui-ai-settings-editor-no-beat",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await duplicate(page, "Continue writing", copyName);
      await page.getByTestId("ai-editor-body").fill("Write the scene in the keeper's plain, salted voice.");
      await page.getByTestId("ai-editor-warning").waitFor();
    },
  },
  {
    name: "ui-ai-settings-editor-empty",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await duplicate(page, "Continue writing", copyName);
      await page.getByTestId("ai-editor-body").fill("");
      await page.getByTestId("ai-editor-error").waitFor();
    },
  },
  {
    name: "ui-ai-settings-template-saved",
    route: "/settings/ai",
    steps: async (page) => {
      await open(page);
      await duplicate(page, "Continue writing", copyName);
      await page.getByTestId("ai-editor-save").click();
      await page.getByTestId("ai-editor").waitFor({ state: "detached" });
      await templateRow(page, copyName).getByRole("button", { name: "Delete" }).waitFor();
    },
  },
  {
    name: "ui-ai-settings-in-write",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`,
    steps: async (page, ctx) => {
      // J22: copy a template, edit it, connect a second provider, then pick both in Write.
      await open(page);
      await duplicate(page, "Continue writing", copyName);
      await page.getByTestId("ai-editor-body").fill("Write the beat as prose in the keeper's plain voice.\n\n{{style_guide}}\n\n{{context}}\n\n{{previous_prose}}\n\nBeat: {{beat}}\nAbout {{length}} words.");
      await page.getByTestId("ai-editor-save").click();
      await page.getByTestId("ai-editor").waitFor({ state: "detached" });
      await templateRow(page, copyName).waitFor();
      await connectAndSave(page, "Gateway");
      await page.goto(`/books/${ctx.bookIds.saltAndSignal}/write#scene=1.1`);
      const choice = await insertBeat(page, ctx);
      await choice.click();
      await page.getByTestId("write-draft-picker").waitFor();
      await page.getByTestId("write-draft-picker").getByText(copyName).waitFor();
      await page.getByTestId("write-draft-picker").getByText("Gateway").waitFor();
    },
  },
];
