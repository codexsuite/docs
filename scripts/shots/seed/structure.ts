import { expectOk } from "../../lib/api.ts";
import { acts, categories, entries, labelData, saltAndSignal, seriesData, tideTables } from "../demo-book.ts";
import { viewerUser, type AdminSession, type SeedResult, type StructureSeed } from "../types.ts";

/** The parts of the outline answer that the seed reads. */
interface Outline {
  acts: {
    id: string;
    chapters: { id: string; archived: boolean; scenes: { id: string; number: string }[] }[];
  }[];
}

interface Idd {
  id: string;
}

const outlineOf = (session: AdminSession, bookId: string) =>
  expectOk<Outline>(session, "GET", `/api/books/${bookId}/outline`);

/** Creates the series, both books, the structure, prose, labels, knowledge base and the viewer. */
export async function seedStructure(session: AdminSession): Promise<StructureSeed> {
  const series = await expectOk<Idd>(session, "POST", "/api/series", { ...seriesData, bookIds: [] });
  const salt = await expectOk<Idd>(session, "POST", "/api/books", {
    ...saltAndSignal,
    seriesId: series.id,
  });
  const tide = await expectOk<Idd>(session, "POST", "/api/books", {
    ...tideTables,
    seriesId: series.id,
  });

  await buildOutline(session, salt.id);
  const outline = await outlineOf(session, salt.id);
  const sceneIds: Record<string, string> = {};
  for (const act of outline.acts)
    for (const chapter of act.chapters)
      if (!chapter.archived) for (const scene of chapter.scenes) sceneIds[scene.number] = scene.id;

  const entryIds = await buildKnowledgeBase(session, salt.id, sceneIds);
  await applyContent(session, salt.id, sceneIds);
  const viewer = await ensureViewer(session);

  return {
    seriesId: series.id,
    bookIds: { saltAndSignal: salt.id, tideTables: tide.id },
    sceneIds,
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

/** Creates the labels once and returns them by name. */
async function labelIdsByName(session: AdminSession, bookId: string): Promise<Record<string, string>> {
  const existing = await expectOk<(Idd & { name: string })[]>(session, "GET", `/api/books/${bookId}/labels`);
  const byName: Record<string, string> = Object.fromEntries(existing.map((l) => [l.name, l.id]));
  for (const label of labelData) {
    if (!byName[label.name]) {
      const created = await expectOk<Idd>(session, "POST", `/api/books/${bookId}/labels`, label);
      byName[label.name] = created.id;
    }
  }
  return byName;
}

/** Writes titles, summaries, statuses, labels and prose. Safe to repeat, so restore calls it too. */
async function applyContent(session: AdminSession, bookId: string, sceneIds: Record<string, string>): Promise<void> {
  const labelIds = await labelIdsByName(session, bookId);
  const outline = await outlineOf(session, bookId);
  let number = 0;
  for (let a = 0; a < acts.length; a++) {
    const liveChapters = outline.acts[a]!.chapters.filter((chapter) => !chapter.archived);
    for (let c = 0; c < acts[a]!.chapters.length; c++) {
      number++;
      const chapter = acts[a]!.chapters[c]!;
      await expectOk(session, "PATCH", `/api/chapters/${liveChapters[c]!.id}`, {
        title: chapter.title,
        summary: chapter.summary,
        isNumbered: true,
      });
      for (let s = 0; s < chapter.scenes.length; s++) {
        const scene = chapter.scenes[s]!;
        const id = sceneIds[`${number}.${s + 1}`]!;
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

/** Creates the categories and entries, then links entries to scenes. Returns entry ids by name. */
async function buildKnowledgeBase(
  session: AdminSession,
  bookId: string,
  sceneIds: Record<string, string>,
): Promise<Record<string, string>> {
  const categoryIds: Record<string, string> = {};
  for (const category of categories) {
    const created = await expectOk<Idd>(session, "POST", `/api/books/${bookId}/kb/categories`, category);
    categoryIds[category.name] = created.id;
  }
  const entryIds: Record<string, string> = {};
  for (const entry of entries) {
    const created = await expectOk<Idd>(session, "POST", `/api/books/${bookId}/kb/entries`, {
      categoryId: categoryIds[entry.category],
      name: entry.name,
    });
    entryIds[entry.name] = created.id;
  }
  await applyKnowledgeBase(session, sceneIds, entryIds);
  return entryIds;
}

async function applyKnowledgeBase(
  session: AdminSession,
  sceneIds: Record<string, string>,
  entryIds: Record<string, string>,
): Promise<void> {
  for (const entry of entries) {
    const id = entryIds[entry.name]!;
    await expectOk(session, "PATCH", `/api/kb/entries/${id}`, {
      name: entry.name,
      summary: entry.summary,
      body: entry.body,
      aliases: entry.aliases,
    });
    for (const number of entry.scenes) await expectOk(session, "POST", `/api/scenes/${sceneIds[number]}/kb`, { entryId: id });
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
 * Puts the structure back to the state seedStructure left: restores archived chapters and scenes,
 * archives anything a spec added, then writes every seeded field again.
 */
export async function restoreStructure(session: AdminSession, seed: SeedResult): Promise<void> {
  const bookId = seed.bookIds.saltAndSignal;
  const seeded = new Set(Object.values(seed.sceneIds));
  let outline = await outlineOf(session, bookId);

  for (const act of outline.acts)
    for (const chapter of act.chapters) {
      if (chapter.archived) await expectOk(session, "POST", `/api/chapters/${chapter.id}/restore`);
      const archived = await expectOk<Idd[]>(session, "GET", `/api/chapters/${chapter.id}/archived-scenes`);
      for (const scene of archived) {
        if (seeded.has(scene.id)) await expectOk(session, "POST", `/api/scenes/${scene.id}/restore`);
      }
    }

  outline = await outlineOf(session, bookId);
  for (const act of outline.acts) {
    for (const chapter of act.chapters) {
      if (chapter.archived) continue;
      const own = chapter.scenes.filter((scene) => seeded.has(scene.id));
      if (own.length === 0) {
        await expectOk(session, "POST", `/api/chapters/${chapter.id}/archive`);
        continue;
      }
      for (const scene of chapter.scenes)
        if (!seeded.has(scene.id)) await expectOk(session, "POST", `/api/scenes/${scene.id}/archive`);
    }
    const hasSeed = act.chapters.some((chapter) => !chapter.archived && chapter.scenes.some((s) => seeded.has(s.id)));
    if (!hasSeed) await expectOk(session, "POST", `/api/acts/${act.id}/archive`);
  }

  await applyContent(session, bookId, seed.sceneIds);
  await applyKnowledgeBase(session, seed.sceneIds, seed.entryIds);
}
