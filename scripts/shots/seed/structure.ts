import { expectOk } from "../../lib/api.ts";
import { acts, categories, entries, labelData, saltAndSignal, seriesData, tideTables } from "../demo-book.ts";
import { viewerUser, type AdminSession, type StructureSeed } from "../types.ts";

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
