import { type ShotSpec, viewerUser } from "../types.ts";

export const shots: ShotSpec[] = [
  {
    name: "ui-account-overview",
    route: "/account",
    steps: async (page) => {
      await page.getByTestId("auth-account-page").waitFor();
      await page.getByTestId("auth-tokens-section").waitFor();
    },
  },
  {
    name: "ui-account-sign-in",
    route: "/login",
    steps: async (page) => {
      await page.context().clearCookies();
      await page.goto("/login");
      await page.getByTestId("auth-login-page").waitFor();
    },
  },
  {
    name: "ui-account-wrong-password",
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
    name: "ui-account-user-menu",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("shell-avatar").click();
      await page.getByTestId("auth-user-menu-sign-out").waitFor();
    },
  },
  {
    name: "ui-account-password",
    route: "/account",
    steps: async (page) => {
      await page.getByTestId("auth-password-current").fill("the current password");
      await page.getByTestId("auth-password-new").fill("a new password, ten or more");
      await page.getByTestId("auth-password-confirm").fill("a new password, ten or more");
    },
  },
  {
    name: "ui-account-password-mismatch",
    route: "/account",
    steps: async (page) => {
      await page.getByTestId("auth-password-current").fill("the current password");
      await page.getByTestId("auth-password-new").fill("a new password, ten or more");
      await page.getByTestId("auth-password-confirm").fill("a different password");
      await page.getByTestId("auth-password-submit").click();
      await page.getByTestId("auth-password-error").waitFor();
    },
  },
  {
    name: "ui-account-token-form",
    route: "/account",
    steps: async (page) => {
      await page.getByTestId("auth-token-name").fill("Claude Code on the desktop");
      await page.getByTestId("auth-token-scope-write").check();
    },
  },
  {
    name: "ui-account-token-created",
    route: "/account",
    steps: async (page) => {
      await page.getByTestId("auth-token-name").fill("Claude Code on the desktop");
      await page.getByTestId("auth-token-scope-write").check();
      await page.getByTestId("auth-token-create").click();
      await page.getByTestId("auth-token-secret").waitFor();
    },
  },
  {
    name: "ui-account-token-list",
    route: "/account",
    steps: async (page) => {
      await page.getByTestId("auth-token-name").fill("Claude Code on the desktop");
      await page.getByTestId("auth-token-create").click();
      await page.getByTestId("auth-token-secret-dismiss").click();
      await page.locator("[data-testid^='auth-token-row-']").first().waitFor();
    },
  },
];
