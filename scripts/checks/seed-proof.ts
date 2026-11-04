import { expectOk } from "../lib/api.ts";
import { blobDigest, restoreSnapshot } from "../lib/stack.ts";
import { disturbStructure, snapshotStructure } from "../shots/demo-book.ts";
import { restoreFixtures } from "../shots/seed.ts";
import type { AdminSession, SeedResult } from "../shots/types.ts";

/**
 * The restore proof for seed-check.ts. It reads the whole seeded state through the REST API, changes everything a
 * shot spec could change, restores, and compares the two reads. Nothing here prints a body or a credential.
 */

function fail(message: string): never {
  throw new Error(message);
}

/** The text of a GET answer, or its status when it is not 2xx, so a deleted record reads as "status 404". */
async function get(session: AdminSession, path: string): Promise<string> {
  const response = await session.api("GET", path);
  return response.ok ? await response.text() : `status ${response.status}`;
}

/** One string with the part of the seeded state that a spec can reach, History lines and drafts included. */
export async function readEverything(session: AdminSession, seed: SeedResult): Promise<string> {
  const book = seed.bookIds.saltAndSignal;
  const parts: Record<string, unknown> = {};
  parts.structure = await snapshotStructure(session, seed);

  const list = await get(session, `/api/books/${book}/sources`);
  parts.sources = list;
  const listed = list.startsWith("status") ? [] : (JSON.parse(list) as { id: string }[]).map((row) => row.id);
  for (const id of [...new Set([...Object.values(seed.sourceIds), ...listed])].sort()) {
    parts[`source ${id}`] = await get(session, `/api/references/${id}`);
  }
  parts.quoteFlags = await get(session, `/api/books/${book}/quote-flags`);
  parts.drafts = await get(session, `/api/books/${book}/drafts`);
  parts.layout = await get(session, `/api/books/${book}/layout`);
  parts.layoutSettings = await get(session, `/api/books/${book}/settings/layout`);
  parts.publication = await get(session, `/api/books/${book}/publication-settings`);
  parts.sharing = await get(session, `/api/books/${book}/sharing`);
  parts.integrations = await get(session, "/api/ai/integrations");
  const users = await expectOk<{ id: string; email: string }[]>(session, "GET", "/api/admin/users");
  parts.users = users.map((u) => `${u.id} ${u.email}`).sort();
  return JSON.stringify(parts);
}

interface Draft {
  id: string;
  sceneId: string;
  beatId: string | null;
  status: string;
  attempt: number;
}

const sourceFields = {
  kind: "book",
  authorsText: "Penhallow, A.",
  year: 1931,
  publisher: "Harbour Press",
  edition: null,
  isbn: null,
  doi: null,
  url: null,
  accessedOn: null,
  rightsHolder: null,
};

/** Sends a request with a multipart body. The session helper only sends JSON. */
async function sendForm(session: AdminSession, path: string, form: FormData): Promise<void> {
  const response = await fetch(`${session.baseUrl}${path}`, {
    method: "POST",
    headers: { cookie: session.cookie, "x-codex-client": "docs" },
    body: form,
  });
  if (!response.ok) fail(`POST ${path} answered ${response.status}.`);
}

/** Reads a streamed draft answer to its end and checks that it did not end in an error line. */
async function finishStream(response: Response, what: string): Promise<void> {
  if (!response.ok) fail(`${what} answered ${response.status}.`);
  const lines = (await response.text()).split("\n").filter((line) => line.trim().length > 0);
  const events = lines.map((line) => JSON.parse(line) as { error?: unknown; final?: unknown });
  if (events.some((event) => event.error)) fail(`${what} ended with an error line.`);
  if (!events.some((event) => event.final)) fail(`${what} ended without a final line.`);
}

/**
 * Changes what a shot spec might change on the references side and on the sharing, integration and template side,
 * then the structure. After each change the read must differ from the one before, so a change that did not register
 * fails here and not as a silent pass.
 */
export async function disturbEverything(session: AdminSession, seed: SeedResult): Promise<void> {
  const book = seed.bookIds.saltAndSignal;
  const ledger = seed.sourceIds["The Keeper's Ledger"]!;
  const signals = seed.sourceIds["Signals at Sea"]!;
  const scene12 = seed.sceneIds["1.2"]!;
  let last = await readEverything(session, seed);
  const step = async (name: string, change: () => Promise<unknown>): Promise<void> => {
    await change();
    const next = await readEverything(session, seed);
    if (next === last) fail(`The disturbance "${name}" changed nothing.`);
    last = next;
  };

  await step("add a source", () =>
    expectOk(session, "POST", `/api/books/${book}/references`, {
      details: { ...sourceFields, title: "Extra source", licence: "all_rights_reserved" },
      via: null,
    }));
  await step("change source fields", () =>
    expectOk(session, "PATCH", `/api/references/${ledger}`, {
      details: { ...sourceFields, title: "The Keeper's Ledger", licence: "all_rights_reserved", rightsHolder: "Changed holder" },
      entry: null,
    }));
  await step("retype a use", () =>
    expectOk(session, "PATCH", `/api/reference-uses/${seed.useIds["ledgerQuote"]}`, { kind: "paraphrase" }));
  await step("accept fair use", () =>
    expectOk(session, "POST", `/api/references/${signals}/fair-use`, { reason: "Changed by a spec." }));
  await step("raise the quote word limit", () =>
    expectOk(session, "PATCH", `/api/books/${book}/publication-settings`, { quoteWordLimit: 500 }));

  const permissionId = (await expectOk<{ permission: { id: string } }>(session, "GET", `/api/references/${signals}`)).permission.id;
  await step("edit the permission letter", () =>
    expectOk(session, "PATCH", `/api/permission-requests/${permissionId}`, { to: "Changed addressee" }));
  await step("send the permission letter", () => expectOk(session, "POST", `/api/permission-requests/${permissionId}/sent`));
  await step("grant permission with a signed letter", () => {
    const form = new FormData();
    form.append("letter", new Blob(["Permission granted, invented text for the docs."], { type: "text/plain" }), "grant.txt");
    form.append("creditLine", "Changed credit line");
    return sendForm(session, `/api/permission-requests/${permissionId}/granted`, form);
  });
  await step("clear a source", () => expectOk(session, "POST", `/api/references/${ledger}/sign-off`));
  await step("reopen a source", () => expectOk(session, "POST", `/api/references/${ledger}/reopen`));

  const drafts = async () => (await expectOk<{ drafts: Draft[] }>(session, "GET", `/api/books/${book}/drafts`)).drafts;
  const request = (retryOfId: string | null) => ({
    templateId: null,
    model: "fake-model",
    targetWords: null,
    retryOfId,
    integrationId: seed.aiIntegrationId,
  });
  const beatDraft = async () => (await drafts()).find((d) => d.status === "pending" && d.sceneId === scene12 && d.beatId);
  const first = await beatDraft();
  if (!first?.beatId) fail("The seed has no pending beat draft on scene 1.2.");
  await step("retry a draft", async () =>
    finishStream(await session.api("POST", `/api/beats/${first.beatId}/generate`, request(first.id)), "Retry"));
  await step("continue writing on scene 1.2", async () =>
    finishStream(await session.api("POST", `/api/scenes/${scene12}/continue`, request(null)), "Continue"));
  await step("reject a draft", async () => {
    const continuation = (await drafts()).find((d) => d.status === "pending" && d.sceneId === scene12 && !d.beatId);
    if (!continuation) fail("The continuation draft is not pending.");
    await expectOk(session, "POST", `/api/generations/${continuation.id}/discard`);
  });
  await step("accept a draft", async () => {
    const pending = await beatDraft();
    if (!pending) fail("The retried beat draft is not pending.");
    const prose = await expectOk<{ version: number }>(session, "GET", `/api/scenes/${scene12}/prose`);
    await expectOk(session, "POST", `/api/generations/${pending.id}/apply`, { version: prose.version });
  });

  const viewer = seed.viewer.id;
  await step("change the viewer's role", () =>
    expectOk(session, "PUT", `/api/books/${book}/sharing/${viewer}`, { role: "write" }));
  await step("share to another person", async () => {
    const created = await expectOk<{ user: { id: string } }>(session, "POST", "/api/admin/users", {
      email: "second.reader@example.test",
      displayName: "Second Reader",
    });
    await expectOk(session, "PUT", `/api/books/${book}/sharing/${created.user.id}`, { role: "comment" });
  });
  await step("remove the viewer's grant", () => expectOk(session, "DELETE", `/api/books/${book}/sharing/${viewer}`));

  await step("change the template", () =>
    expectOk(session, "PUT", `/api/books/${book}/layout`, { template: "manuscript" }));
  await step("rename the AI integration", () =>
    expectOk(session, "PATCH", `/api/ai/integrations/${seed.aiIntegrationId}`, { label: "Renamed model" }));
  await step("delete the AI integration", () =>
    expectOk(session, "DELETE", `/api/ai/integrations/${seed.aiIntegrationId}`));
  await step("delete a source", () => expectOk(session, "DELETE", `/api/references/${signals}`));

  await disturbStructure(session, seed);
}

/**
 * Seed, read, disturb, restore, read again. Then one more write and a second restore.
 * The caller has seeded already, so the snapshot exists.
 */
export async function proveRestore(session: AdminSession, seed: SeedResult): Promise<void> {
  const seedCopy = JSON.stringify(seed);
  const before = await readEverything(session, seed);
  const blobsBefore = blobDigest();
  console.log(`Read ${(before.length / 1024).toFixed(0)} KB of seeded state. Blobs: ${blobsBefore}.`);

  await disturbEverything(session, seed);
  const blobsDisturbed = blobDigest();
  if (blobsDisturbed === blobsBefore) fail("The disturbance did not change the blob folder.");

  // Measurement: the same restore without restarting web and worker, then one read of the library.
  await restoreSnapshot({ restartApp: false });
  const probe = await session.api("GET", "/api/library").then((r) => `status ${r.status}`, () => "no answer");
  console.log(`Without a restart the first read after the restore gave: ${probe}.`);

  const started = Date.now();
  await restoreFixtures(session, seed);
  console.log(`MEASURED restoreSnapshot with restart: ${((Date.now() - started) / 1000).toFixed(1)} s.`);

  const after = await readEverything(session, seed);
  if (after !== before) fail(`SeedIsRepeatableAfterRestore: ${firstDifference(before, after)}`);
  if (blobDigest() !== blobsBefore) fail("The blob folder differs after the restore.");
  if (JSON.stringify(seed) !== seedCopy) fail("The restore changed the ids in the seed.");
  console.log("PASS restore: every read equals the first, blobs equal, seed ids unchanged.");

  const scene = seed.sceneIds["1.1"]!;
  await expectOk(session, "PATCH", `/api/scenes/${scene}`, { title: "One more write" });
  if ((await readEverything(session, seed)) === before) fail("The extra write changed nothing.");
  await restoreFixtures(session, seed);
  const again = await readEverything(session, seed);
  if (again !== before) fail(`RestoreRepeats: ${firstDifference(before, again)}`);
  if (blobDigest() !== blobsBefore) fail("The blob folder differs after the second restore.");
  console.log("PASS restore repeats.");
}

/** Names where two reads first differ, with a short window of each, so the CI log shows the field. */
function firstDifference(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const window = (text: string) => text.slice(Math.max(0, i - 60), i + 80).replace(/\\"/g, "'");
  return `the reads differ at character ${i}. First: ...${window(a)}... Second: ...${window(b)}...`;
}
