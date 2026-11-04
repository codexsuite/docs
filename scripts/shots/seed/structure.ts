import { expectOk } from "../../lib/api.ts";
import { acts, categories, entries, labelData, readLibrary, saltAndSignal, seriesData, tideTables } from "../demo-book.ts";
import { viewerUser, type AdminSession, type SeedResult, type StructureSeed } from "../types.ts";

/** The parts of the outline answer that the seed reads. */
interface Outline {
  acts: {
    id: string;
    title: string;
    chapters: {
      id: string;
      number: number | null;
      archived: boolean;
      archivedSceneCount: number;
      scenes: { id: string; number: string; linkedEntries: { id: string }[] }[];
    }[];
  }[];
}

interface WithId {
  id: string;
}

interface Label {
  id: string;
  scopeId: string;
  name: string;
  color: string | null;
}

interface Kb {
  categories: { id: string; name: string; colour: string | null; fromSeries: boolean }[];
  entries: { id: string; categoryId: string; name: string; fromSeries: boolean }[];
}

/** The ids that the content writer needs. */
type StructureIds = Pick<StructureSeed, "actIds" | "chapterIds" | "sceneIds">;

const outlineOf = (session: AdminSession, bookId: string) =>
  expectOk<Outline>(session, "GET", `/api/books/${bookId}/outline`);

/** Reads the ids of the live acts, numbered chapters and scenes. An archived chapter has no number. */
function idsOf(outline: Outline): StructureIds {
  const ids: StructureIds = { actIds: {}, chapterIds: {}, sceneIds: {} };
  for (const act of outline.acts) {
    ids.actIds[act.title] = act.id;
    for (const chapter of act.chapters) {
      if (chapter.archived || chapter.number === null) continue;
      ids.chapterIds[String(chapter.number)] = chapter.id;
      for (const scene of chapter.scenes) ids.sceneIds[scene.number] = scene.id;
    }
  }
  return ids;
}

/** Creates the series, both books, the structure, prose, labels, knowledge base and the viewer. */
export async function seedStructure(session: AdminSession): Promise<StructureSeed> {
  const series = await expectOk<WithId>(session, "POST", "/api/series", { ...seriesData, bookIds: [] });
  const salt = await expectOk<WithId>(session, "POST", "/api/books", { ...saltAndSignal, seriesId: series.id });
  const tide = await expectOk<WithId>(session, "POST", "/api/books", { ...tideTables, seriesId: series.id });

  await buildOutline(session, salt.id);
  const ids = idsOf(await outlineOf(session, salt.id));
  const categoryIds = await createCategories(session, salt.id);
  const entryIds: Record<string, string> = {};
  for (const entry of entries) {
    const created = await expectOk<WithId>(session, "POST", `/api/books/${salt.id}/kb/entries`, {
      categoryId: categoryIds[entry.category],
      name: entry.name,
    });
    entryIds[entry.name] = created.id;
  }
  await applyKnowledgeBase(session, salt.id, ids.sceneIds, entryIds, categoryIds);
  await applyContent(session, salt.id, ids, await createLabels(session, salt.id));
  const viewer = await ensureViewer(session);

  return {
    seriesId: series.id,
    bookIds: { saltAndSignal: salt.id, tideTables: tide.id },
    ...ids,
    entryIds,
    viewer,
  };
}

/** Makes sure the book has three acts, two chapters in each and two scenes in each chapter, by position. */
async function buildOutline(session: AdminSession, bookId: string): Promise<void> {
  for (let a = 0; a < acts.length; a++) {
    let outline = await outlineOf(session, bookId);
    if (outline.acts.length <= a) {
      const last = outline.acts[outline.acts.length - 1];
      await expectOk(session, "POST", `/api/books/${bookId}/acts`, { title: acts[a]!.title, afterId: last?.id ?? null });
      outline = await outlineOf(session, bookId);
    }
    const actId = outline.acts[a]!.id;
    await expectOk(session, "PATCH", `/api/acts/${actId}`, { title: acts[a]!.title });

    for (let c = 0; c < acts[a]!.chapters.length; c++) {
      outline = await outlineOf(session, bookId);
      let live = outline.acts[a]!.chapters.filter((chapter) => !chapter.archived);
      if (live.length <= c) {
        await expectOk(session, "POST", `/api/acts/${actId}/chapters`, {
          title: acts[a]!.chapters[c]!.title,
          afterId: live[live.length - 1]?.id ?? null,
        });
        outline = await outlineOf(session, bookId);
        live = outline.acts[a]!.chapters.filter((chapter) => !chapter.archived);
      }
      const chapterId = live[c]!.id;
      for (let s = 0; s < 2; s++) {
        outline = await outlineOf(session, bookId);
        const scenes = outline.acts[a]!.chapters.filter((chapter) => !chapter.archived)[c]!.scenes;
        if (scenes.length <= s) {
          await expectOk(session, "POST", `/api/chapters/${chapterId}/scenes`, {
            afterId: scenes[scenes.length - 1]?.id ?? null,
          });
        }
      }
    }
  }
}

/** Creates the four labels and returns their ids by name. */
async function createLabels(session: AdminSession, bookId: string): Promise<Record<string, string>> {
  const byName: Record<string, string> = {};
  for (const label of labelData) {
    const created = await expectOk<WithId>(session, "POST", `/api/books/${bookId}/labels`, label);
    byName[label.name] = created.id;
  }
  return byName;
}

/**
 * Brings the book's own labels back to the four seeded ones and returns their ids by name. A label that kept its
 * name is matched by name. A seeded name with no match takes the earliest label left over, which is how a rename
 * is found again, because labels keep their order. Labels nobody claimed are deleted.
 */
async function restoreLabels(session: AdminSession, bookId: string): Promise<Record<string, string>> {
  const all = await expectOk<Label[]>(session, "GET", `/api/books/${bookId}/labels`);
  const own = all.filter((label) => label.scopeId === bookId);
  const claimed = new Map<string, Label>();
  for (const seeded of labelData) {
    const match = own.find((label) => label.name === seeded.name);
    if (match) claimed.set(seeded.name, match);
  }
  const spare = own.filter((label) => ![...claimed.values()].includes(label));
  for (const seeded of labelData) {
    if (!claimed.has(seeded.name) && spare.length > 0) claimed.set(seeded.name, spare.shift()!);
  }
  for (const extra of spare) await expectOk(session, "DELETE", `/api/labels/${extra.id}`);

  // A temporary name first, so two labels that swapped names cannot collide.
  for (const seeded of labelData) {
    const label = claimed.get(seeded.name);
    if (label && label.name !== seeded.name) {
      await expectOk(session, "PATCH", `/api/labels/${label.id}`, { name: `restoring ${label.id}` });
    }
  }
  const byName: Record<string, string> = {};
  for (const seeded of labelData) {
    const label = claimed.get(seeded.name);
    if (!label) {
      byName[seeded.name] = (await expectOk<WithId>(session, "POST", `/api/books/${bookId}/labels`, seeded)).id;
      continue;
    }
    byName[seeded.name] = label.id;
    if (label.name !== seeded.name || label.color !== seeded.color) {
      await expectOk(session, "PATCH", `/api/labels/${label.id}`, { name: seeded.name, color: seeded.color });
    }
  }
  return byName;
}

/** Writes act titles, chapter titles and summaries, scene titles, summaries, statuses, labels and prose. Safe to repeat. */
async function applyContent(
  session: AdminSession,
  bookId: string,
  ids: StructureIds,
  labelIds: Record<string, string>,
): Promise<void> {
  let number = 0;
  for (const act of acts) {
    await expectOk(session, "PATCH", `/api/acts/${ids.actIds[act.title]}`, { title: act.title });
    for (const chapter of act.chapters) {
      number++;
      await expectOk(session, "PATCH", `/api/chapters/${ids.chapterIds[String(number)]}`, {
        title: chapter.title,
        summary: chapter.summary,
        isNumbered: true,
      });
      for (let s = 0; s < chapter.scenes.length; s++) {
        const scene = chapter.scenes[s]!;
        const id = ids.sceneIds[`${number}.${s + 1}`]!;
        await expectOk(session, "PATCH", `/api/scenes/${id}`, {
          title: scene.title,
          summary: scene.summary,
          status: scene.status,
        });
        await expectOk(session, "PUT", `/api/scenes/${id}/labels`, {
          labelIds: scene.labels.map((name) => labelIds[name]!),
        });
        const current = await expectOk<{ version: number; body: string }>(session, "GET", `/api/scenes/${id}/prose`);
        if (current.body !== scene.prose) {
          await expectOk(session, "PUT", `/api/scenes/${id}/prose`, { body: scene.prose, version: current.version });
        }
      }
    }
  }
}

/** Creates the three categories and returns their ids by name. */
async function createCategories(session: AdminSession, bookId: string): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const category of categories) {
    ids[category.name] = (await expectOk<WithId>(session, "POST", `/api/books/${bookId}/kb/categories`, category)).id;
  }
  return ids;
}

/** Makes sure the book's own categories exist with the seeded colours, and returns their ids by name. */
async function restoreCategories(session: AdminSession, bookId: string, kb: Kb): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const category of categories) {
    const found = kb.categories.find((c) => !c.fromSeries && c.name === category.name);
    if (!found) {
      ids[category.name] = (await expectOk<WithId>(session, "POST", `/api/books/${bookId}/kb/categories`, category)).id;
      continue;
    }
    ids[category.name] = found.id;
    if (found.colour !== category.colour) {
      await expectOk(session, "PATCH", `/api/kb/categories/${found.id}`, { colour: category.colour });
    }
  }
  return ids;
}

/** Writes every seeded entry field, then makes each scene's entry links exactly the seeded ones. */
async function applyKnowledgeBase(
  session: AdminSession,
  bookId: string,
  sceneIds: Record<string, string>,
  entryIds: Record<string, string>,
  categoryIds: Record<string, string>,
): Promise<void> {
  for (const entry of entries) {
    const id = entryIds[entry.name]!;
    const current = await expectOk<{ fieldDefs: { key: string }[]; fields: Record<string, string> }>(
      session,
      "GET",
      `/api/kb/entries/${id}`,
    );
    const blank = Object.fromEntries(current.fieldDefs.map((def) => [def.key, ""]));
    const fieldsSet = Object.values(current.fields ?? {}).some((value) => value !== "");
    await expectOk(session, "PATCH", `/api/kb/entries/${id}`, {
      name: entry.name,
      keepOldName: false,
      categoryId: categoryIds[entry.category],
      summary: entry.summary,
      body: entry.body,
      aliases: entry.aliases,
      tags: [],
      alwaysInContext: false,
      excludeFromAutoContext: false,
      customFields: [],
      ...(fieldsSet ? { fields: blank } : {}),
    });
  }

  const outline = await outlineOf(session, bookId);
  const linked = new Map<string, Set<string>>();
  for (const act of outline.acts)
    for (const chapter of act.chapters)
      for (const scene of chapter.scenes) linked.set(scene.id, new Set(scene.linkedEntries.map((e) => e.id)));
  for (const [number, sceneId] of Object.entries(sceneIds)) {
    const current = linked.get(sceneId);
    if (!current) continue;
    const wanted = new Set(entries.filter((e) => e.scenes.includes(number)).map((e) => entryIds[e.name]!));
    for (const entryId of current)
      if (!wanted.has(entryId)) await expectOk(session, "DELETE", `/api/scenes/${sceneId}/kb/${entryId}`);
    for (const entryId of wanted)
      if (!current.has(entryId)) await expectOk(session, "POST", `/api/scenes/${sceneId}/kb`, { entryId });
  }
}

/** Creates the viewer, or finds it when the email already exists. The one-time password is dropped unread. */
async function ensureViewer(session: AdminSession): Promise<{ id: string; email: string }> {
  const response = await session.api("POST", "/api/admin/users", viewerUser);
  if (response.status === 201) {
    const created = (await response.json()) as { user: { id: string } };
    return { id: created.user.id, email: viewerUser.email };
  }
  if (response.status !== 409) throw new Error(`POST /api/admin/users answered ${response.status}.`);
  const users = await expectOk<{ id: string; email: string }[]>(session, "GET", "/api/admin/users");
  const found = users.find((user) => user.email === viewerUser.email);
  if (!found) throw new Error("POST /api/admin/users answered 409 but no user has the viewer email.");
  return { id: found.id, email: viewerUser.email };
}

/**
 * Puts everything back to the state seedStructure left, in this order:
 * 1. Books and the series. Restores the seeded ones, deletes any book that is not in the seed, and writes the title,
 *    subtitle, status and target of both books and the name and description of the series.
 * 2. Restores seeded acts, chapters and scenes that a spec archived.
 * 3. Puts acts, chapters and scenes back in order.
 * 4. Archives scenes, chapters and acts that are not in the seed. The product has no hard delete for these.
 *    A spec that adds one does it on a throwaway book, so this is a backstop.
 * 5. Labels, then categories, entries and links. A seeded entry that was deleted is created again under a new id,
 *    and seed.entryIds is updated in place.
 * 6. Act, chapter and scene fields, scene labels and prose.
 */
export async function restoreStructure(session: AdminSession, seed: SeedResult): Promise<void> {
  const bookId = seed.bookIds.saltAndSignal;
  await restoreBooks(session, seed);
  await restoreArchivedParts(session, bookId, seed);
  await restoreOrder(session, bookId, seed);
  await archiveExtraParts(session, bookId, seed);

  const labelIds = await restoreLabels(session, bookId);
  const kb = await expectOk<Kb>(session, "GET", `/api/books/${bookId}/kb`);
  const categoryIds = await restoreCategories(session, bookId, kb);
  const live = new Set(kb.entries.map((entry) => entry.id));
  const seeded = new Set(Object.values(seed.entryIds));
  for (const entry of kb.entries)
    if (!entry.fromSeries && !seeded.has(entry.id)) await expectOk(session, "DELETE", `/api/kb/entries/${entry.id}`);
  for (const entry of entries) {
    if (live.has(seed.entryIds[entry.name]!)) continue;
    const created = await expectOk<WithId>(session, "POST", `/api/books/${bookId}/kb/entries`, {
      categoryId: categoryIds[entry.category],
      name: entry.name,
    });
    seed.entryIds[entry.name] = created.id;
  }
  await applyKnowledgeBase(session, bookId, seed.sceneIds, seed.entryIds, categoryIds);
  await applyContent(session, bookId, seed, labelIds);
}

async function restoreBooks(session: AdminSession, seed: SeedResult): Promise<void> {
  const seeded = new Set(Object.values(seed.bookIds));
  const archivedSeries = (await readLibrary(session, true)).series;
  if (archivedSeries.some((series) => series.id === seed.seriesId && series.archived)) {
    await expectOk(session, "POST", `/api/series/${seed.seriesId}/restore`);
  }
  for (const book of (await readLibrary(session, true)).books) {
    if (seeded.has(book.id)) await expectOk(session, "POST", `/api/books/${book.id}/restore`);
    else if (book.role === "owner") await expectOk(session, "DELETE", `/api/books/${book.id}`);
  }
  for (const book of (await readLibrary(session, false)).books) {
    if (seeded.has(book.id) || book.role !== "owner") continue;
    await expectOk(session, "POST", `/api/books/${book.id}/archive`);
    await expectOk(session, "DELETE", `/api/books/${book.id}`);
  }

  await expectOk(session, "PATCH", `/api/series/${seed.seriesId}`, {
    name: seriesData.name,
    description: seriesData.description,
  });
  for (const book of [
    { id: seed.bookIds.saltAndSignal, ...saltAndSignal },
    { id: seed.bookIds.tideTables, ...tideTables },
  ]) {
    await expectOk(session, "PATCH", `/api/books/${book.id}/settings`, {
      title: book.title,
      subtitle: book.subtitle,
      status: book.status,
      targetWords: book.targetWords,
    });
  }
}

/** Restores acts, then chapters, then scenes, because each needs its parent to be live. */
async function restoreArchivedParts(session: AdminSession, bookId: string, seed: SeedResult): Promise<void> {
  let outline = await outlineOf(session, bookId);
  const liveActs = new Set(outline.acts.map((act) => act.id));
  for (const actId of Object.values(seed.actIds))
    if (!liveActs.has(actId)) await expectOk(session, "POST", `/api/acts/${actId}/restore`);

  outline = await outlineOf(session, bookId);
  const chapterIds = new Set(Object.values(seed.chapterIds));
  for (const act of outline.acts)
    for (const chapter of act.chapters)
      if (chapter.archived && chapterIds.has(chapter.id)) await expectOk(session, "POST", `/api/chapters/${chapter.id}/restore`);

  outline = await outlineOf(session, bookId);
  const sceneIds = new Set(Object.values(seed.sceneIds));
  for (const act of outline.acts)
    for (const chapter of act.chapters) {
      if (chapter.archived || chapter.archivedSceneCount === 0) continue;
      const archived = await expectOk<WithId[]>(session, "GET", `/api/chapters/${chapter.id}/archived-scenes`);
      for (const scene of archived)
        if (sceneIds.has(scene.id)) await expectOk(session, "POST", `/api/scenes/${scene.id}/restore`);
    }
}

/** The order the seed built: acts, their chapters and their scenes, as ids. */
function wantedOrder(seed: SeedResult): { id: string; chapters: { id: string; scenes: string[] }[] }[] {
  let number = 0;
  return acts.map((act) => ({
    id: seed.actIds[act.title]!,
    chapters: act.chapters.map((chapter) => {
      number++;
      return {
        id: seed.chapterIds[String(number)]!,
        scenes: chapter.scenes.map((_, s) => seed.sceneIds[`${number}.${s + 1}`]!),
      };
    }),
  }));
}

/** Moves acts, chapters and scenes with PUT .../position until the seeded ones sit as seeded. Extras may sit between. */
async function restoreOrder(session: AdminSession, bookId: string, seed: SeedResult): Promise<void> {
  const wanted = wantedOrder(seed);
  const actSet = new Set(wanted.map((a) => a.id));
  const chapterSet = new Set(wanted.flatMap((a) => a.chapters.map((c) => c.id)));
  const sceneSet = new Set(wanted.flatMap((a) => a.chapters.flatMap((c) => c.scenes)));
  const outline = await outlineOf(session, bookId);
  const have = outline.acts
    .filter((act) => actSet.has(act.id))
    .map((act) => ({
      id: act.id,
      chapters: act.chapters
        .filter((chapter) => !chapter.archived && chapterSet.has(chapter.id))
        .map((chapter) => ({ id: chapter.id, scenes: chapter.scenes.map((s) => s.id).filter((id) => sceneSet.has(id)) })),
    }));
  if (JSON.stringify(have) === JSON.stringify(wanted)) return;

  let previousAct: string | null = null;
  for (const act of wanted) {
    await expectOk(session, "PUT", `/api/acts/${act.id}/position`, { afterId: previousAct });
    previousAct = act.id;
  }
  for (const act of wanted) {
    let previousChapter: string | null = null;
    for (const chapter of act.chapters) {
      await expectOk(session, "PUT", `/api/chapters/${chapter.id}/position`, { actId: act.id, afterId: previousChapter });
      previousChapter = chapter.id;
    }
  }
  for (const act of wanted)
    for (const chapter of act.chapters) {
      let previousScene: string | null = null;
      for (const sceneId of chapter.scenes) {
        await expectOk(session, "PUT", `/api/scenes/${sceneId}/position`, { chapterId: chapter.id, afterId: previousScene });
        previousScene = sceneId;
      }
    }
}

/** Archives every live scene, chapter and act that is not in the seed. */
async function archiveExtraParts(session: AdminSession, bookId: string, seed: SeedResult): Promise<void> {
  const actSet = new Set(Object.values(seed.actIds));
  const chapterSet = new Set(Object.values(seed.chapterIds));
  const sceneSet = new Set(Object.values(seed.sceneIds));
  const outline = await outlineOf(session, bookId);
  for (const act of outline.acts) {
    for (const chapter of act.chapters) {
      if (chapter.archived) continue;
      if (!chapterSet.has(chapter.id)) {
        await expectOk(session, "POST", `/api/chapters/${chapter.id}/archive`);
        continue;
      }
      for (const scene of chapter.scenes)
        if (!sceneSet.has(scene.id)) await expectOk(session, "POST", `/api/scenes/${scene.id}/archive`);
    }
  }
  for (const act of outline.acts)
    if (!actSet.has(act.id)) await expectOk(session, "POST", `/api/acts/${act.id}/archive`);
}
