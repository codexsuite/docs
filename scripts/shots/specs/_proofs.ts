import type { Page } from "playwright";
import { viewerUser, type ShotSpec } from "../types.ts";

/** Proves the runner's relative calls, the viewer sign-in and the masks. Never in the matrix, because it is not a page key. */
export const shots: ShotSpec[] = [
  {
    name: "_proofs-relative",
    route: "/",
    steps: async (page) => {
      await page.goto("/");
      const me = await page.request.get("/api/auth/me");
      if (!me.ok()) throw new Error(`GET /api/auth/me answered ${me.status()}.`);
      await page.getByTestId("library-new-book").waitFor();
    },
  },
  {
    name: "_proofs-viewer",
    as: "viewer",
    route: "/",
    steps: async (page) => {
      const me = await page.request.get("/api/auth/me");
      if (!me.ok()) throw new Error(`GET /api/auth/me answered ${me.status()}.`);
      const body = (await me.json()) as { email: string; isAdmin: boolean };
      if (body.email !== viewerUser.email) throw new Error("The shot is not signed in as the viewer.");
      if (body.isAdmin) throw new Error("The viewer is an admin.");
    },
  },
  {
    name: "_proofs-masked",
    route: "/",
    mask: [".proof-secret"],
    steps: async (page) => {
      await page.getByTestId("library-new-book").waitFor();
      // A function declared inside page.evaluate breaks under tsx (__name is not defined), so build the HTML outside.
      const random = () => Math.random().toString(36).slice(2, 12);
      const html = `<p class="proof-secret">custom ${random()}</p><p data-testid="auth-token-secret">cdx_${random()}</p><p data-testid="auth-one-time-password">${random()}</p><time>${random()}</time>`;
      await page.evaluate((markup) => document.body.insertAdjacentHTML("beforeend", markup), html);
    },
  },
];

/**
 * Order matters here: admin steps, viewer, admin steps, plain admin, all on the Users screen.
 * The viewer never signed in on the seeded state, so every admin shot must show "Never" whatever came before it.
 * Run it with --shot _proofs-users.
 */
const usersRoute = "/settings/users";
const neverSignedIn = async (page: Page): Promise<void> => {
  await page.getByText("Never", { exact: false }).first().waitFor({ timeout: 15_000 });
};
shots.push(
  { name: "_proofs-users-1", route: usersRoute, steps: neverSignedIn },
  { name: "_proofs-users-2", as: "viewer", route: "/", steps: async (page) => {
    const me = await page.request.get("/api/auth/me");
    if (!me.ok()) throw new Error(`GET /api/auth/me answered ${me.status()}.`);
    if (((await me.json()) as { email: string }).email !== viewerUser.email) throw new Error("The shot is not signed in as the viewer.");
  } },
  { name: "_proofs-users-3", route: usersRoute, steps: neverSignedIn },
  { name: "_proofs-users-4", route: usersRoute },
);
