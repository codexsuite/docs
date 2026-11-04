import type { Page } from "playwright";
import type { ShotSpec } from "../types.ts";

/** Guide: connect Claude Code. The shots cover the Codex side: the Agent access section, the token form, the one-time box, and the Library and Plan the agent reads. */

const section = "auth-tokens-section";

async function fillForm(page: Page): Promise<void> {
  await page.getByTestId(section).waitFor();
  await page.getByTestId(section).scrollIntoViewIfNeeded();
  await page.getByTestId("auth-token-name").fill("Claude Code on my laptop");
  await page.getByTestId("auth-token-expiry").selectOption({ label: "90 days" });
}

export const shots: ShotSpec[] = [
  {
    name: "start-guides-first-agent-overview",
    route: "/account",
    steps: async (page) => {
      await page.getByTestId(section).waitFor();
      await page.getByTestId(section).scrollIntoViewIfNeeded();
    },
  },
  {
    name: "start-guides-first-agent-form",
    route: "/account",
    steps: fillForm,
  },
  {
    name: "start-guides-first-agent-secret",
    route: "/account",
    // The box prints the claude mcp add command, which holds the secret. The list shows the token prefix.
    mask: ["[role=status] code", "tbody td:nth-child(2)"],
    steps: async (page) => {
      await fillForm(page);
      await page.getByTestId("auth-token-create").click();
      await page.getByTestId("auth-token-secret").waitFor();
      await page.getByTestId("auth-token-secret").scrollIntoViewIfNeeded();
    },
  },
  {
    name: "start-guides-first-agent-library",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("library-new-book").waitFor();
    },
  },
  {
    name: "start-guides-first-agent-plan",
    route: (ctx) => `/books/${ctx.bookIds.saltAndSignal}/plan`,
    steps: async (page, ctx) => {
      await page.getByTestId("plan-board").waitFor();
      await page.getByTestId(`plan-act-${ctx.actIds["The Light"]}`).waitFor();
    },
  },
];
