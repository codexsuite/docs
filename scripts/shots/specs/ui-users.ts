import type { Locator, Page } from "playwright";
import { type ShotSpec, viewerUser } from "../types.ts";

const newUser = { email: "marta.quill@example.test", displayName: "Marta Quill" } as const;
const mask = ["td.text-muted"];

const openUsers = async (page: Page) => {
  await page.goto("/settings/users");
  await page.getByTestId("auth-users-page").waitFor();
  await userRow(page, viewerUser.email).waitFor();
};

const userRow = (page: Page, email: string): Locator =>
  page.locator("[data-testid^='auth-user-row-']").filter({ hasText: email });

const addUser = async (page: Page) => {
  await openUsers(page);
  await page.getByTestId("auth-add-user-email").fill(newUser.email);
  await page.getByTestId("auth-add-user-name").fill(newUser.displayName);
};

export const shots: ShotSpec[] = [
  {
    name: "ui-users-overview",
    route: "/settings/users",
    mask,
    steps: async (page) => {
      await openUsers(page);
    },
  },
  {
    name: "ui-users-add",
    route: "/settings/users",
    mask,
    steps: async (page) => {
      await addUser(page);
    },
  },
  {
    name: "ui-users-one-time-password",
    route: "/settings/users",
    mask,
    steps: async (page) => {
      await addUser(page);
      await page.getByTestId("auth-add-user-submit").click();
      await page.getByTestId("auth-one-time-password").waitFor();
      await userRow(page, newUser.email).waitFor();
    },
  },
  {
    name: "ui-users-duplicate",
    route: "/settings/users",
    mask,
    steps: async (page) => {
      await openUsers(page);
      await page.getByTestId("auth-add-user-email").fill(viewerUser.email);
      await page.getByTestId("auth-add-user-name").fill("Ines Calloway");
      await page.getByTestId("auth-add-user-submit").click();
      await page.getByTestId("auth-users-error").waitFor();
    },
  },
  {
    name: "ui-users-reset-password",
    route: "/settings/users",
    mask,
    steps: async (page) => {
      await openUsers(page);
      await userRow(page, viewerUser.email).getByRole("button", { name: "Reset password" }).click();
      await page.getByTestId("auth-one-time-password").waitFor();
      await userRow(page, viewerUser.email).getByText("active · must change password").waitFor();
    },
  },
  {
    name: "ui-users-make-admin",
    route: "/settings/users",
    mask,
    steps: async (page) => {
      await openUsers(page);
      await userRow(page, viewerUser.email).getByRole("button", { name: "Make admin" }).click();
      await userRow(page, viewerUser.email).getByRole("button", { name: "Remove admin" }).waitFor();
    },
  },
  {
    name: "ui-users-disabled",
    route: "/settings/users",
    mask,
    steps: async (page) => {
      await openUsers(page);
      await userRow(page, viewerUser.email).getByRole("button", { name: "Disable" }).click();
      await userRow(page, viewerUser.email).getByRole("button", { name: "Enable" }).waitFor();
    },
  },
  {
    name: "ui-users-locked",
    route: "/settings/users",
    mask,
    steps: async (page) => {
      // Ten wrong passwords lock the account. Each refusal is a 401 from the sign-in endpoint.
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        const response = await page.request.post("/api/auth/login", {
          data: { email: viewerUser.email, password: `wrong password ${attempt}` },
        });
        if (response.status() !== 401) throw new Error(`Sign-in attempt ${attempt} answered ${response.status()}.`);
      }
      await openUsers(page);
      await userRow(page, viewerUser.email).getByRole("button", { name: "Unlock" }).waitFor();
    },
  },
  {
    name: "ui-users-unlocked",
    route: "/settings/users",
    mask,
    steps: async (page) => {
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        await page.request.post("/api/auth/login", {
          data: { email: viewerUser.email, password: `wrong password ${attempt}` },
        });
      }
      await openUsers(page);
      await userRow(page, viewerUser.email).getByRole("button", { name: "Unlock" }).click();
      await userRow(page, viewerUser.email).getByRole("button", { name: "Unlock" }).waitFor({ state: "detached" });
    },
  },
  {
    name: "ui-users-revoke-tokens",
    route: "/settings/users",
    mask,
    steps: async (page) => {
      const created = await page.request.post("/api/auth/tokens", {
        data: { name: "Claude Code on the desktop", scopes: ["codex:read"], expiresInDays: 90 },
      });
      if (!created.ok()) throw new Error(`Creating a token answered ${created.status()}.`);
      await page.goto("/settings/users");
      await page.getByTestId("auth-users-page").waitFor();
      const revoke = page.locator("[data-testid^='auth-user-revoke-tokens-']:not([disabled])");
      await revoke.first().waitFor();
      await revoke.first().click();
      await page.locator("[data-testid^='auth-user-revoke-tokens-'][disabled]").first().waitFor();
    },
  },
  {
    name: "ui-users-not-admin",
    route: "/settings/users",
    as: "viewer",
    steps: async (page) => {
      await page.getByText("Only admins can manage users").waitFor();
    },
  },
];
