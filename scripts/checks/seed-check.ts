/**
 * Runs the demo seed modules against a real stack with an empty database. It runs in CI
 * (.github/workflows/seed-check.yml). Never run it on a host without Docker.
 *
 *   tsx scripts/checks/seed-check.ts --part structure|references|all
 *
 * The check is red while a module is still the stub, because the stub returns ids that are not UUIDs.
 */
import { signInFromFile, expectOk } from "../lib/api.ts";
import { down, up } from "../lib/stack.ts";
import { seedDemo } from "../shots/seed.ts";
import { seedStructure } from "../shots/seed/structure.ts";
import { assertStructureFieldsSet } from "../shots/demo-book.ts";
import { viewerUser } from "../shots/types.ts";
import { seedReferences } from "../shots/seed/references.ts";
import { proveRestore } from "./seed-proof.ts";
import type { AdminSession, ReferencesSeed, SeedBook, SeedResult } from "../shots/types.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string): never {
  throw new Error(message);
}

function requireIds(label: string, ids: Record<string, string>, minimum: number): void {
  const entries = Object.entries(ids);
  if (entries.length < minimum) fail(`${label} has ${entries.length} ids, expected at least ${minimum}.`);
  for (const [name, id] of entries) if (!uuid.test(id)) fail(`${label} "${name}" is not a UUID.`);
}

function requireId(label: string, id: string | undefined): void {
  if (!id || !uuid.test(id)) fail(`${label} is not a UUID.`);
}


interface OutlineScene {
  id: string;
  number: string;
}
interface Outline {
  acts: { id: string; chapters: { scenes: OutlineScene[] }[] }[];
}

/** A throwaway book with four chapters of two scenes, so the references part does not need the structure module. */
async function throwawayBook(session: AdminSession): Promise<SeedBook> {
  const book = await expectOk<{ id: string }>(session, "POST", "/api/books", { title: "Throwaway for the references check" });
  const first = await expectOk<Outline>(session, "GET", `/api/books/${book.id}/outline`);
  const actId = first.acts[0]?.id;
  if (!actId) fail("The new book has no act.");
  for (let chapter = 0; chapter < 4; chapter++) {
    const created = await expectOk<{ id: string }>(session, "POST", `/api/acts/${actId}/chapters`, { title: `Chapter ${chapter + 1}`, afterId: null });
    for (let scene = 0; scene < 2; scene++) {
      await expectOk(session, "POST", `/api/chapters/${created.id}/scenes`, { title: null, afterId: null });
    }
  }
  const outline = await expectOk<Outline>(session, "GET", `/api/books/${book.id}/outline`);
  const sceneIds: Record<string, string> = {};
  for (const act of outline.acts) for (const chapter of act.chapters) for (const s of chapter.scenes) sceneIds[s.number] = s.id;
  return { id: book.id, sceneIds, entryIds: {} };
}

/** The checks the brief names for the references module. */
async function checkReferences(session: AdminSession, bookId: string, draftSceneId: string, seed: ReferencesSeed): Promise<void> {
  const signalsId = seed.sourceIds["Signals at Sea"]!;
  const detail = await expectOk<{ quotedWords: number; limit: number; uses: { id: string }[]; checks: { key: string; status: string }[]; permission: { status: string } | null }>(
    session, "GET", `/api/references/${signalsId}`);
  const liveUses = new Set(detail.uses.map((u) => u.id));
  if (!liveUses.has(seed.useIds["signalsQuote"]!)) fail("QuoteShowsOverPublisherLimit: the Signals at Sea use is not live.");
  if (!(detail.quotedWords > detail.limit)) fail(`QuoteShowsOverPublisherLimit: ${detail.quotedWords} words against a limit of ${detail.limit}.`);
  if (!detail.checks.some((c) => c.key === "words" && c.status === "danger")) fail("QuoteShowsOverPublisherLimit: the words check is not red.");
  if (detail.permission?.status !== "draft") fail("QuoteShowsOverPublisherLimit: the permission letter is not a draft.");
  console.log("PASS QuoteShowsOverPublisherLimit");

  const drafts = await expectOk<{ drafts: { status: string; sceneId: string; beatId: string | null }[] }>(session, "GET", `/api/books/${bookId}/drafts`);
  if (!drafts.drafts.some((d) => d.status === "pending" && d.sceneId === draftSceneId && d.beatId)) {
    fail("PendingDraftAppearsOnScene: scene 1.2 has no pending draft from a beat.");
  }
  console.log("PASS PendingDraftAppearsOnScene");

  // The default template answers GET /layout whether or not the book pinned it. Only settings/layout is null without a pin.
  const catalogue = await expectOk<{ templates: { slug: string; name: string; version: string }[] }>(session, "GET", `/api/books/${bookId}/layout`);
  const wanted = catalogue.templates.find((t) => t.slug === seed.templateSlug);
  if (!wanted) fail(`TemplatePinned: the catalogue has no ${seed.templateSlug}.`);
  const pinned = await expectOk<{ template: { name: string; pinnedVersion: string; trimSize: string | null } | null }>(session, "GET", `/api/books/${bookId}/settings/layout`);
  if (!pinned.template) fail("TemplatePinned: the book has no pinned template.");
  if (pinned.template.name !== wanted.name || pinned.template.pinnedVersion !== wanted.version || pinned.template.trimSize !== "6x9") {
    fail(`TemplatePinned: the book pins ${pinned.template.name} ${pinned.template.pinnedVersion} at ${pinned.template.trimSize ?? "no trim"}.`);
  }
  console.log("PASS TemplatePinned");

  const sharing = await expectOk<{ book: { role: string; user: { email: string | null } }[] }>(session, "GET", `/api/books/${bookId}/sharing`);
  if (!sharing.book.some((g) => g.role === "view" && g.user.email?.toLowerCase() === viewerUser.email)) fail("BookSharedToViewer: the viewer has no view grant.");
  console.log("PASS BookSharedToViewer");
}

/** Runs on a stack without the local endpoints switch. A private https address is refused and the answer names the switch. */
async function checkProviderRefused(): Promise<void> {
  down();
  const plain = await up({ override: false });
  const session = await signInFromFile(plain.baseUrl, plain.credentialsFile);
  const settings = await expectOk<{ localEndpointsAllowed: boolean }>(session, "GET", "/api/ai/integrations");
  if (settings.localEndpointsAllowed) fail("error:provider-refused-without-local-endpoints: the plain stack allows local endpoints.");
  const response = await session.api("POST", "/api/ai/integrations/test", { kind: "openai_compatible", baseUrl: "https://10.0.0.5/v1", apiKey: "fake-key-for-docs" });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.status !== 400 || !body.error?.includes("CODEX_AI_ALLOW_LOCAL_ENDPOINTS")) {
    fail(`error:provider-refused-without-local-endpoints: status ${response.status}, message ${body.error ?? "none"}.`);
  }
  console.log("PASS error:provider-refused-without-local-endpoints");
}

async function main(): Promise<void> {
  const part = process.argv[process.argv.indexOf("--part") + 1];
  if (part !== "structure" && part !== "references" && part !== "all") {
    fail("Usage: seed-check.ts --part structure|references|all");
  }
  const stack = await up({ override: true });
  const session = await signInFromFile(stack.baseUrl, stack.credentialsFile);

  if (part === "structure") {
    const structure = await seedStructure(session);
    requireId("seriesId", structure.seriesId);
    requireId("Salt and Signal", structure.bookIds.saltAndSignal);
    requireId("Tide Tables", structure.bookIds.tideTables);
    requireIds("sceneIds", structure.sceneIds, 12);
    requireIds("entryIds", structure.entryIds, 4);
    requireId("viewer", structure.viewer.id);
    await expectOk(session, "GET", `/api/books/${structure.bookIds.saltAndSignal}/outline`);
    await assertStructureFieldsSet(session, structure);
    console.log("PASS structure");
    return;
  }

  if (part === "references") {
    const book = await throwawayBook(session);
    const references = await seedReferences(session, book);
    requireIds("sourceIds", references.sourceIds, 2);
    requireIds("useIds", references.useIds, 3);
    requireId("aiIntegrationId", references.aiIntegrationId);
    await checkReferences(session, book.id, book.sceneIds["1.2"]!, references);
    // A second run must find the first one's rows.
    const again = await seedReferences(session, book);
    if (JSON.stringify(again.useIds) !== JSON.stringify(references.useIds)) fail("Running the references seed twice changed the use ids.");
    await checkReferences(session, book.id, book.sceneIds["1.2"]!, references);
    await checkProviderRefused();
    console.log("PASS references");
    return;
  }

  // The whole seed needs the structure module as well.
  const seed: SeedResult = await seedDemo(session);
  requireIds("sourceIds", seed.sourceIds, 2);
  requireIds("useIds", seed.useIds, 3);
  requireId("aiIntegrationId", seed.aiIntegrationId);
  if (seed.templateSlug !== "novel-6x9") fail("templateSlug is not novel-6x9.");
  if (part === "all") {
    requireIds("sceneIds", seed.sceneIds, 12);
    requireIds("entryIds", seed.entryIds, 4);
    await checkReferences(session, seed.bookIds.saltAndSignal, seed.sceneIds["1.2"]!, seed);
    await proveRestore(session, seed);
    await checkReferences(session, seed.bookIds.saltAndSignal, seed.sceneIds["1.2"]!, seed);
  }
  console.log(`PASS ${part}`);
}

main()
  .then(() => {
    down();
    process.exit(0);
  })
  .catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    down();
    process.exit(1);
  });
