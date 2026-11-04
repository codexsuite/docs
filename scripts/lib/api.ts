import { readFileSync } from "node:fs";
import type { AdminSession } from "../shots/types.ts";

/**
 * Signs in to a running instance and returns a session that calls the REST API as that user.
 * The cookie stays inside the session. Nothing here prints a body, a header or a credential.
 */
export async function signIn(baseUrl: string, email: string, password: string): Promise<AdminSession> {
  const origin = baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-codex-client": "docs" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Sign-in failed: POST /api/auth/login answered ${response.status}.`);
  }
  const cookie = response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0]!)
    .filter((pair) => pair.startsWith("codex.auth"))
    .join("; ");
  if (!cookie) {
    throw new Error("Sign-in answered 200 but set no codex.auth cookie.");
  }
  return {
    baseUrl: origin,
    cookie,
    api(method, path, body) {
      return fetch(`${origin}${path}`, {
        method,
        headers: {
          cookie,
          "x-codex-client": "docs",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
  };
}

/** The shape of the credentials file the stack helper writes. */
export interface StackCredentials {
  adminEmail: string;
  adminPassword: string;
}

/** Signs in with the admin credentials in the private file that `up()` returns. */
export function signInFromFile(baseUrl: string, credentialsFile: string): Promise<AdminSession> {
  const credentials = JSON.parse(readFileSync(credentialsFile, "utf8")) as StackCredentials;
  return signIn(baseUrl, credentials.adminEmail, credentials.adminPassword);
}

/** Calls the API and throws with the method, path, status, and the API's code and error text when the answer is not 2xx. */
export async function expectOk<T = unknown>(
  session: AdminSession,
  method: Parameters<AdminSession["api"]>[0],
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await session.api(method, path, body);
  if (!response.ok) {
    let message = "";
    try {
      // The API answers { error, code }: the text for people and a stable code.
      const body = (await response.json()) as { error?: string; code?: string };
      message = ` ${body.code ?? ""} ${body.error ?? ""}`.trimEnd();
    } catch {
      // The answer had no JSON body.
    }
    throw new Error(`${method} ${path} answered ${response.status}.${message}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface CreatedToken {
  /** The secret, shown once by the server. Never log it. */
  secret: string;
}

/** Creates a personal access token by the route the Account page calls. */
export async function createToken(
  session: AdminSession,
  name: string,
  scopes: string[] = ["codex:read"],
): Promise<CreatedToken> {
  const created = await expectOk<{ secret: string }>(session, "POST", "/api/auth/tokens", {
    name,
    scopes,
    expiresInDays: 1,
  });
  return { secret: created.secret };
}
