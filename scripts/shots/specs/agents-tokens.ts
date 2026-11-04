import type { Page } from "playwright";
import type { ShotSpec } from "../types.ts";

const section = "auth-tokens-section";

async function openAgentAccess(page: Page): Promise<void> {
  await page.getByTestId(section).waitFor();
  await page.getByTestId(section).scrollIntoViewIfNeeded();
}

async function createToken(page: Page, name: string, scopes: string[], expiry: string): Promise<void> {
  await page.getByTestId("auth-token-name").fill(name);
  for (const scope of scopes) {
    await page.getByTestId(`auth-token-scope-${scope}`).check();
  }
  await page.getByTestId("auth-token-expiry").selectOption({ label: expiry });
}

/** Account, Agent access: create a token, see its secret once, and read the list. */
export const shots: ShotSpec[] = [
  {
    name: "agents-tokens-overview",
    route: "/account",
    steps: openAgentAccess,
  },
  {
    name: "agents-tokens-create",
    route: "/account",
    steps: async (page) => {
      await openAgentAccess(page);
      await createToken(page, "Claude Code on my laptop", ["write"], "90 days");
    },
  },
  {
    name: "agents-tokens-secret",
    route: "/account",
    // The box also prints the claude mcp add command, which holds the secret.
    mask: ["[role=status] code"],
    steps: async (page) => {
      await openAgentAccess(page);
      await createToken(page, "Claude Code on my laptop", ["write"], "90 days");
      await page.getByTestId("auth-token-create").click();
      await page.getByTestId("auth-token-secret").waitFor();
      await page.getByTestId("auth-token-secret").scrollIntoViewIfNeeded();
    },
  },
  {
    name: "agents-tokens-list",
    route: "/account",
    mask: ["tbody td:nth-child(4)"],
    steps: async (page) => {
      await openAgentAccess(page);
      await createToken(page, "Claude Code on my laptop", ["write"], "90 days");
      await page.getByTestId("auth-token-create").click();
      await page.getByTestId("auth-token-secret-dismiss").click();
      await createToken(page, "Reading agent", [], "30 days");
      await page.getByTestId("auth-token-create").click();
      await page.getByTestId("auth-token-secret-dismiss").click();
      await page.getByRole("button", { name: "Revoke" }).first().waitFor();
      await page.getByTestId(section).scrollIntoViewIfNeeded();
    },
  },
];
