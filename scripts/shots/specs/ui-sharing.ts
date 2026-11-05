import type { Locator, Page } from "playwright";
import type { AdminSession, SeedResult, ShotSpec } from "../types.ts";
import { signInViewer } from "../viewer.ts";

/** Sharing a book: Book settings, Sharing card of Salt and Signal. Ines Calloway starts with Can view on the book. */

const route = (ctx: SeedResult) => `/books/${ctx.bookIds.saltAndSignal}/settings#sharing`;

async function openSharing(page: Page): Promise<void> {
  await page.getByTestId("settings-section-sharing").waitFor();
  await page.getByTestId("settings-sharing-person").first().waitFor();
  await page.getByTestId("settings-section-sharing").scrollIntoViewIfNeeded();
}

/** Takes Ines off the book so the card can add her again. */
async function removeViewer(page: Page): Promise<void> {
  await openSharing(page);
  await page.getByTestId("settings-sharing-remove").first().click();
  await page.getByTestId("settings-sharing-person").first().waitFor({ state: "detached" });
  await page.getByTestId("settings-sharing-empty").first().waitFor();
  // The message can arrive after the list changes, so wait for it before a caller dismisses messages.
  await page.getByText("Removed Ines Calloway.").first().waitFor();
}

/** Dismisses every message so a shot shows only the message of its own step. */
async function clearToasts(page: Page): Promise<void> {
  const dismiss = page.getByTestId("editing-toast-dismiss");
  while (await dismiss.count()) await dismiss.first().click();
}

/** Types the email into the Salt and Signal field (the first of the two, the second is for the series) and waits for the answer. */
async function lookUp(page: Page, email: string, result: string): Promise<Locator> {
  const field = page.getByTestId("settings-sharing-email").first();
  await field.fill(email);
  const answer = page.getByTestId(result).first();
  await answer.waitFor();
  return answer;
}

async function addViewer(page: Page, ctx: SeedResult, role: "view" | "comment" | "write"): Promise<void> {
  await removeViewer(page);
  await clearToasts(page);
  await lookUp(page, ctx.viewer.email, "settings-sharing-match");
  await page.getByTestId("settings-sharing-match-role").first().selectOption(role);
  await page.getByTestId("settings-sharing-add").first().click();
  await page.getByTestId("settings-sharing-person").first().waitFor();
}

export const shots: ShotSpec[] = [
  {
    name: "ui-sharing-live-access",
    route,
    steps: async (page, ctx) => {
      const origin = new URL(page.url()).origin;
      const cookie = (await page.context().cookies(origin))
        .filter((c) => c.name.startsWith("codex.auth"))
        .map((c) => `${c.name}=${c.value}`).join("; ");
      const admin: AdminSession = {
        baseUrl: origin,
        cookie,
        api: (method, path, body) => fetch(`${origin}${path}`, {
          method,
          headers: { cookie, "x-codex-client": "docs", ...(body === undefined ? {} : { "content-type": "application/json" }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      };
      const viewer = await signInViewer(admin, ctx.viewer.id);
      const browser = page.context().browser();
      if (!browser) throw new Error("The viewer needs a browser context.");
      const second = await browser.newContext({ baseURL: origin });
      try {
        await second.addCookies(viewer.cookie.split("; ").map((pair) => {
          const i = pair.indexOf("=");
          return { name: pair.slice(0, i), value: pair.slice(i + 1), url: origin };
        }));
        const tab = await second.newPage();
        const joined = new Promise<void>((resolve) => {
          tab.on("websocket", (socket) => {
            let invocationId: string | undefined;
            socket.on("framesent", ({ payload }) => {
              for (const record of String(payload).split("\x1e").filter(Boolean)) {
                const message = JSON.parse(record) as { target?: string; invocationId?: string };
                if (message.target === "JoinBook") invocationId = message.invocationId;
              }
            });
            socket.on("framereceived", ({ payload }) => {
              for (const record of String(payload).split("\x1e").filter(Boolean)) {
                const message = JSON.parse(record) as { type?: number; invocationId?: string };
                if (invocationId && message.type === 3 && message.invocationId === invocationId) resolve();
              }
            });
          });
        });
        await tab.goto(`/books/${ctx.bookIds.saltAndSignal}/write`);
        await tab.getByTestId("shell-role-chip").waitFor();
        await joined;
        await openSharing(page);
        await page.getByTestId("settings-sharing-role").first().selectOption("write");
        await tab.getByText("You can edit this book now. Typing works again.").waitFor();
        await tab.getByTestId("shell-role-chip").waitFor({ state: "detached" });
        await page.getByTestId("settings-sharing-remove").first().click();
        await tab.getByTestId("shell-library-page").waitFor();
        await tab.getByText(/stopped sharing.*with you/).waitFor();
      } finally {
        await second.close();
      }
    },
  },
  {
    name: "ui-sharing-overview",
    route,
    steps: openSharing,
  },
  {
    name: "ui-sharing-no-match",
    route,
    steps: async (page) => {
      await openSharing(page);
      await lookUp(page, "nobody.here@example.test", "settings-sharing-no-match");
    },
  },
  {
    name: "ui-sharing-match",
    route,
    steps: async (page, ctx) => {
      await removeViewer(page);
      await clearToasts(page);
      await lookUp(page, ctx.viewer.email, "settings-sharing-match");
      await page.getByTestId("settings-sharing-match-role").first().selectOption("comment");
    },
  },
  {
    name: "ui-sharing-added",
    route,
    steps: async (page, ctx) => {
      await addViewer(page, ctx, "comment");
      await page.getByText("Shared Salt and Signal with Ines Calloway · Can comment").first().waitFor();
    },
  },
  {
    name: "ui-sharing-role",
    route,
    steps: async (page, ctx) => {
      await addViewer(page, ctx, "view");
      await clearToasts(page);
      await page.getByTestId("settings-sharing-role").first().selectOption("write");
      await page.getByText("Ines Calloway can now edit Salt and Signal").first().waitFor();
    },
  },
  {
    name: "ui-sharing-series",
    route,
    steps: async (page, ctx) => {
      await openSharing(page);
      const field = page.getByTestId("settings-sharing-email").nth(1);
      await field.fill(ctx.viewer.email);
      const match = page.getByTestId("settings-sharing-match");
      await match.waitFor();
      await page.getByTestId("settings-sharing-match-role").selectOption("comment");
      await page.getByTestId("settings-sharing-add").click();
      await page.getByTestId("settings-sharing-series-list").getByTestId("settings-sharing-person").waitFor();
    },
  },
  {
    name: "ui-sharing-removed",
    route,
    steps: async (page) => {
      await removeViewer(page);
      await page.getByText("Removed Ines Calloway. Their open tabs go back to Library.").first().waitFor();
      await page.getByTestId("settings-sharing-book-list").scrollIntoViewIfNeeded();
    },
  },
  {
    name: "ui-sharing-viewer",
    route,
    as: "viewer",
    steps: async (page) => {
      await page.getByTestId("settings-section-sharing").waitFor();
      await page.getByTestId("settings-sharing-role-text").first().waitFor();
      await page.getByTestId("settings-read-only-note").waitFor();
      await page.getByTestId("settings-section-sharing").scrollIntoViewIfNeeded();
    },
  },
];
