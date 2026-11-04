import type { Page } from "playwright";
import type { ShotSpec } from "../types.ts";

/** Opens the sign-in page without the admin session the runner copies in. */
async function openSignIn(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByTestId("auth-login-email").waitFor();
}

export const shots: ShotSpec[] = [
  {
    name: "start-quickstart-sign-in",
    route: "/login",
    steps: async (page) => {
      await openSignIn(page);
    },
  },
  {
    name: "start-quickstart-library",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("library-new-book").waitFor();
    },
  },
  {
    name: "start-quickstart-refused",
    route: "/login",
    steps: async (page) => {
      await openSignIn(page);
      await page.getByTestId("auth-login-email").fill("nobody@example.test");
      await page.getByTestId("auth-login-password").fill("not-the-password");
      await page.getByTestId("auth-login-submit").click();
      await page.getByTestId("auth-login-error").waitFor();
    },
  },
];
