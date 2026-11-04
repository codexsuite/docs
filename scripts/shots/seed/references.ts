import { randomUUID } from "node:crypto";
import { expectOk } from "../../lib/api.ts";
import { viewerUser } from "../types.ts";
import type { AdminSession, ReferencesSeed, SeedBook } from "../types.ts";

/**
 * The references half of the demo seed, from docs/running-example.md: two sources, their uses, a quote over the
 * quote word limit with a permission letter in draft, the AI integration at the fake model, a pending draft on
 * scene 1.2, the print template and the book shared to the viewer. It uses the REST API only.
 */

const ledgerTitle = "The Keeper's Ledger";
const signalsTitle = "Signals at Sea";

/** Where each use lives. Display numbers come from the structure module. */
const ledgerQuoteScene = "1.1";
const signalsQuoteScene = "2.1";
const ledgerParaphraseScene = "3.1";
const draftScene = "1.2";

const ledgerQuote =
  "The lamp was lit at dusk and trimmed at midnight, and the keeper wrote both hours in the book before she slept.";

const ledgerParaphrase = "Penhallow records that the lamp was trimmed twice a night through every winter of the decade.";

/** Invented. It has 348 words, past the default limit of 300, and stays under the 2000 characters one citation takes, so the source needs a permission letter. */
const signalsQuote = [
  "A signal station is judged by what it does on the worst night of the year, and the worst night is rarely the loudest one.",
  "On the coast the Okafor survey covered, the stations that failed did so in fog, when the lamp could be seen from nowhere and the horn could be heard from nowhere either.",
  "The keepers who held their stations through those nights shared one habit, which was to write down what they could not see.",
  "They logged the sound of the swell on the bar, the colour of the water at the mouth of the harbour, and the number of boats that had not yet come in.",
  "None of this was required by the board. The board asked for the hour the lamp was lit and the hour it was put out, and nothing else.",
  "The extra notes were kept for the next keeper, who would arrive at a station with no map of it and a lamp that had its own temper.",
  "In the third year of the survey, a keeper at the northern station recorded that the lens ran warm on clear nights and cold on damp ones.",
  "She could not explain it, but she wrote it down, and the engineer who rebuilt the station two winters later used the note to move the vent.",
  "That is how most improvements arrived. A keeper noticed something, wrote it in a margin, and years later someone with a ladder read the margin.",
  "The board never credited these notes, and the keepers never asked it to. They said the notes were a courtesy to a stranger.",
  "Where stations had no habit of notes, each new keeper repeated the mistakes of the last, and the survey found the same fault recorded under five different names.",
  "The most reliable predictor of a safe station was not the age of its lamp, nor the height of its tower, nor the pay of its keeper.",
  "It was whether the logbook held more than the hours. A station whose book held only hours had, in the survey's phrase, no memory.",
].join(" ");

interface UserRow {
  id: string;
  email: string;
}
interface SharingUser {
  id: string;
  displayName: string;
}
interface ProseRow {
  body: string;
  version: number;
}
interface IntegrationRow {
  id: string;
  label: string;
}
interface IntegrationList {
  integrations: IntegrationRow[];
}
interface SourceRow {
  id: string;
  title: string;
}
interface Detail {
  quotedWords: number;
  limit: number;
  uses: { id: string; sceneId: string; kind: string }[];
  permission: { id: string; status: string } | null;
}
interface Cited {
  useId: string;
  version: number;
}
interface DraftList {
  drafts: { id: string; sceneId: string; status: string }[];
}

function sceneIdOf(book: SeedBook, number: string): string {
  const id = book.sceneIds[number];
  if (!id) throw new Error(`The book has no scene ${number}. The references seed needs scenes 1.1, 1.2, 2.1 and 3.1.`);
  return id;
}

async function readProse(session: AdminSession, sceneId: string): Promise<ProseRow> {
  return expectOk<ProseRow>(session, "GET", `/api/scenes/${sceneId}/prose`);
}

/** Adds a paragraph to the end of the scene prose unless it is already there, and returns the new version. */
async function ensureParagraph(session: AdminSession, sceneId: string, paragraph: string): Promise<number> {
  const prose = await readProse(session, sceneId);
  if (prose.body.includes(paragraph)) return prose.version;
  const body = prose.body.trim().length === 0 ? paragraph : `${prose.body.trimEnd()}\n\n${paragraph}`;
  const saved = await expectOk<{ version: number }>(session, "PUT", `/api/scenes/${sceneId}/prose`, {
    body,
    version: prose.version,
  });
  return saved.version;
}

async function addSource(
  session: AdminSession,
  bookId: string,
  details: Record<string, string | number | null>,
): Promise<string> {
  const title = String(details.title);
  const existing = await expectOk<SourceRow[]>(session, "GET", `/api/books/${bookId}/sources`);
  const found = existing.find((row) => row.title === title);
  if (found) return found.id;
  const added = await expectOk<{ id: string | null; existingId: string | null }>(
    session,
    "POST",
    `/api/books/${bookId}/references`,
    { details, via: null },
  );
  const id = added.id ?? added.existingId;
  if (!id) throw new Error(`Adding the source "${title}" returned no id.`);
  return id;
}

async function cite(
  session: AdminSession,
  sceneId: string,
  sourceId: string,
  passage: string,
  kind: string,
  locator: string,
): Promise<Cited> {
  const version = await ensureParagraph(session, sceneId, passage);
  const result = await expectOk<{ useId: string; version: number }>(session, "POST", "/api/citations", {
    sceneId,
    sourceId,
    version,
    passage,
    kind,
    locator,
  });
  return { useId: result.useId, version: result.version };
}

async function ensureViewerShare(session: AdminSession, bookId: string): Promise<void> {
  const users = await expectOk<UserRow[]>(session, "GET", "/api/admin/users");
  if (!users.some((u) => u.email.toLowerCase() === viewerUser.email)) {
    await expectOk(session, "POST", "/api/admin/users", {
      email: viewerUser.email,
      displayName: viewerUser.displayName,
    });
  }
  const person = await expectOk<SharingUser>(session, "POST", `/api/books/${bookId}/sharing/lookup`, {
    email: viewerUser.email,
  });
  await expectOk(session, "PUT", `/api/books/${bookId}/sharing/${person.id}`, { role: "view" });
}

async function ensureIntegration(session: AdminSession): Promise<string> {
  const label = "Fake model";
  const list = await expectOk<IntegrationList>(session, "GET", "/api/ai/integrations");
  let id = list.integrations.find((row) => row.label === label)?.id;
  if (!id) {
    const created = await expectOk<IntegrationRow>(session, "POST", "/api/ai/integrations", {
      kind: "openai_compatible",
      label,
      baseUrl: "http://fake-model:4010/v1",
      apiKey: "fake-key-for-docs",
      defaultModel: "fake-model",
    });
    id = created.id;
  }
  // Test connection caches the model list, which the draft panel's picker reads.
  await expectOk(session, "POST", `/api/ai/integrations/${id}/test`);
  return id;
}

/** Puts a beat in scene 1.2 and generates its draft at the fake model. The draft stays pending. */
async function ensurePendingDraft(session: AdminSession, book: SeedBook, integrationId: string): Promise<void> {
  const sceneId = sceneIdOf(book, draftScene);
  const drafts = await expectOk<DraftList>(session, "GET", `/api/books/${book.id}/drafts`);
  if (drafts.drafts.some((d) => d.sceneId === sceneId && d.status === "pending")) return;

  const beatId = randomUUID();
  const prose = await readProse(session, sceneId);
  const body = `${prose.body.trimEnd()}${prose.body.trim() ? "\n\n" : ""}::beat{id="${beatId}"}\n`;
  await expectOk(session, "POST", `/api/scenes/${sceneId}/beats`, { beatId, body, version: prose.version });
  await expectOk(session, "PATCH", `/api/beats/${beatId}`, {
    title: "Edith counts the flashes",
    body: "Edith counts the flashes until dawn while Tobias checks the lens.",
    targetWordCount: 80,
  });

  const response = await session.api("POST", `/api/beats/${beatId}/generate`, {
    templateId: null,
    model: "fake-model",
    targetWords: null,
    retryOfId: null,
    integrationId,
  });
  if (!response.ok) throw new Error(`POST /api/beats/{id}/generate answered ${response.status}.`);
  const lines = (await response.text()).split("\n").filter((line) => line.trim().length > 0);
  const events = lines.map((line) => JSON.parse(line) as { error?: { message?: string }; final?: unknown });
  const failed = events.find((event) => event.error);
  if (failed) throw new Error(`The draft stream ended with an error: ${failed.error?.message ?? "no message"}.`);
  if (!events.some((event) => event.final)) throw new Error("The draft stream ended without a final line.");
}

async function ensurePermissionDraft(session: AdminSession, sourceId: string): Promise<void> {
  const detail = await expectOk<Detail>(session, "GET", `/api/references/${sourceId}`);
  if (detail.permission && detail.permission.status === "draft") return;
  if (detail.permission && detail.permission.status === "sent") {
    await expectOk(session, "POST", `/api/permission-requests/${detail.permission.id}/withdraw`);
  }
  const drafted = await expectOk<Detail>(session, "POST", `/api/references/${sourceId}/permission`);
  if (!drafted.permission) throw new Error("Drafting the permission letter returned no permission.");
  await expectOk(session, "PATCH", `/api/permission-requests/${drafted.permission.id}`, {
    to: "Permissions, Tidewater Review",
  });
}

export async function seedReferences(session: AdminSession, book: SeedBook): Promise<ReferencesSeed> {
  // Fail on a missing scene before anything is written.
  for (const number of [ledgerQuoteScene, draftScene, signalsQuoteScene, ledgerParaphraseScene]) sceneIdOf(book, number);

  const ledgerId = await addSource(session, book.id, {
    kind: "book",
    title: ledgerTitle,
    authorsText: "Penhallow, A.",
    year: 1931,
    publisher: "Harbour Press",
    edition: null,
    isbn: null,
    doi: null,
    url: null,
    accessedOn: null,
    licence: "public_domain",
    rightsHolder: null,
  });
  const signalsId = await addSource(session, book.id, {
    kind: "book",
    title: signalsTitle,
    authorsText: "Okafor, R.",
    year: 1978,
    publisher: "Tidewater Review",
    edition: null,
    isbn: null,
    doi: null,
    url: null,
    accessedOn: null,
    licence: "all_rights_reserved",
    rightsHolder: "Tidewater Review",
  });

  const detail = await expectOk<Detail>(session, "GET", `/api/references/${signalsId}`);
  const have = (sceneId: string, kind: string) => detail.uses.find((u) => u.sceneId === sceneId && u.kind === kind)?.id;
  const ledgerScene = sceneIdOf(book, ledgerQuoteScene);
  const signalsScene = sceneIdOf(book, signalsQuoteScene);
  const paraphraseScene = sceneIdOf(book, ledgerParaphraseScene);
  const ledgerDetail = await expectOk<Detail>(session, "GET", `/api/references/${ledgerId}`);
  const ledgerHave = (sceneId: string, kind: string) =>
    ledgerDetail.uses.find((u) => u.sceneId === sceneId && u.kind === kind)?.id;

  const useIds: Record<string, string> = {
    ledgerQuote:
      ledgerHave(ledgerScene, "quote") ?? (await cite(session, ledgerScene, ledgerId, ledgerQuote, "quote", "p. 12")).useId,
    ledgerParaphrase:
      ledgerHave(paraphraseScene, "paraphrase") ??
      (await cite(session, paraphraseScene, ledgerId, ledgerParaphrase, "paraphrase", "pp. 40-41")).useId,
    signalsQuote:
      have(signalsScene, "quote") ?? (await cite(session, signalsScene, signalsId, signalsQuote, "quote", "pp. 88-91")).useId,
  };

  const after = await expectOk<Detail>(session, "GET", `/api/references/${signalsId}`);
  if (after.quotedWords <= after.limit) {
    throw new Error(`The Signals at Sea quote has ${after.quotedWords} words and the limit is ${after.limit}. It must be over.`);
  }
  await ensurePermissionDraft(session, signalsId);

  const aiIntegrationId = await ensureIntegration(session);
  await ensurePendingDraft(session, book, aiIntegrationId);

  await expectOk(session, "PUT", `/api/books/${book.id}/layout`, { template: "novel-6x9", trim: "6x9" });
  await ensureViewerShare(session, book.id);

  return {
    sourceIds: { [ledgerTitle]: ledgerId, [signalsTitle]: signalsId },
    useIds,
    aiIntegrationId,
    templateSlug: "novel-6x9",
  };
}
