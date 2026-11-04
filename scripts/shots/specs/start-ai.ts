import type { Page } from "playwright";
import type { ShotSpec } from "../types.ts";

async function openDialog(page: Page): Promise<void> {
  await page.getByTestId("ai-list").waitFor();
  await page.getByTestId("ai-connect").click();
  await page.getByTestId("ai-connect-dialog").waitFor();
}

/** AI providers: the list, the connect dialog, a passing test and a refused address. */
export const shots: ShotSpec[] = [
  {
    name: "start-ai-overview",
    route: "/settings/ai",
    steps: async (page) => {
      await page.getByTestId("ai-list").waitFor();
    },
  },
  {
    name: "start-ai-connect",
    route: "/settings/ai",
    steps: openDialog,
  },
  {
    name: "start-ai-test",
    route: "/settings/ai",
    steps: async (page, ctx) => {
      await page.getByTestId(`ai-row-test-${ctx.aiIntegrationId}`).click();
      await page.getByTestId(`ai-row-test-result-${ctx.aiIntegrationId}`).waitFor();
    },
  },
  {
    name: "start-ai-address-refused",
    route: "/settings/ai",
    steps: async (page) => {
      await openDialog(page);
      await page.getByTestId("ai-connect-base-url").fill("http://169.254.169.254/v1");
      await page.getByTestId("ai-connect-api-key").fill("sk-example-not-a-real-key");
      await page.getByTestId("ai-connect-test").click();
      await page.getByTestId("ai-connect-test-result").or(page.getByTestId("ai-connect-error")).waitFor();
    },
  },
];
