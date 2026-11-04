import { randomBytes } from "node:crypto";
import { signIn } from "../lib/api.ts";
import type { AdminSession } from "./types.ts";
import { viewerUser } from "./types.ts";

export interface ViewerSession {
  /** Value of the Cookie header for the signed-in viewer. Never log it. */
  cookie: string;
  /** Values that must never appear in a log: the one-time password, the new password and the cookie. */
  secrets: string[];
}

/** Takes the codex.auth pairs from a response's Set-Cookie headers. */
function authCookie(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((line) => line.split(";")[0]!)
    .filter((pair) => pair.startsWith("codex.auth"))
    .join("; ");
}

/**
 * Signs in as the viewer. The admin resets the viewer's password, which returns a one-time password.
 * The viewer signs in with it and must change it, so the runner picks a random new password.
 * The change returns a fresh cookie. The viewer's cookie replaces any earlier one, because the reset signs the viewer out everywhere.
 * Nothing here prints a body, a header or a password. Errors name the method, path and status.
 */
export async function signInViewer(admin: AdminSession, viewerId: string): Promise<ViewerSession> {
  const reset = await admin.api("POST", `/api/admin/users/${viewerId}/reset-password`);
  if (!reset.ok) throw new Error(`POST /api/admin/users/{id}/reset-password answered ${reset.status}.`);
  const { oneTimePassword } = (await reset.json()) as { oneTimePassword: string };
  const viewer = await signIn(admin.baseUrl, viewerUser.email, oneTimePassword);
  const newPassword = `Shots-${randomBytes(12).toString("hex")}`;
  const change = await viewer.api("POST", "/api/auth/password", { currentPassword: oneTimePassword, newPassword });
  if (!change.ok) throw new Error(`POST /api/auth/password answered ${change.status}.`);
  const cookie = authCookie(change);
  if (!cookie) throw new Error("POST /api/auth/password answered 200 but set no codex.auth cookie.");
  return { cookie, secrets: [oneTimePassword, newPassword, cookie, viewer.cookie] };
}
