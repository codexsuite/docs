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
