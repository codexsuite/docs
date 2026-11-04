import { type ShotSpec, viewerUser } from "../types.ts";

/** Users and sign-in: the Users page, adding a user, and the sign-in refusal. */
export const shots: ShotSpec[] = [
  {
    name: "start-sign-in-users",
    route: "/settings/users",
    steps: async (page) => {
      await page.getByTestId("auth-users-page").waitFor();
      await page.getByTestId("auth-add-user-email").waitFor();
    },
  },
  {
    name: "start-sign-in-add-user",
    route: "/settings/users",
    steps: async (page) => {
      await page.getByTestId("auth-add-user-email").fill("rosa.tennant@example.test");
      await page.getByTestId("auth-add-user-name").fill("Rosa Tennant");
      await page.getByTestId("auth-add-user-submit").click();
      await page.getByTestId("auth-one-time-password").waitFor();
    },
  },
  {
    name: "start-sign-in-refused",
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
];
