import { type ShotSpec, viewerUser } from "../types.ts";

/** Troubleshooting: the two failures the app shows on screen. */
export const shots: ShotSpec[] = [
  {
    name: "start-troubleshooting-refused",
    route: "/login",
    steps: async (page) => {
      await page.context().clearCookies();
      await page.goto("/login");
      await page.getByTestId("auth-login-email").fill(viewerUser.email);
      await page.getByTestId("auth-login-password").fill("not-the-password");
      await page.getByTestId("auth-login-submit").click();
      await page.getByTestId("auth-login-error").waitFor();
    },
  },
  {
    name: "start-troubleshooting-address-refused",
    route: "/settings/ai",
    steps: async (page) => {
      await page.getByTestId("ai-list").waitFor();
      await page.getByTestId("ai-connect").click();
      await page.getByTestId("ai-connect-dialog").waitFor();
      await page.getByTestId("ai-connect-base-url").fill("http://169.254.169.254/v1");
      await page.getByTestId("ai-connect-api-key").fill("sk-example-not-a-real-key");
      await page.getByTestId("ai-connect-test").click();
      await page.getByTestId("ai-connect-test-result").or(page.getByTestId("ai-connect-error")).waitFor();
    },
  },
];
