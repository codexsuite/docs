import { expectOk } from "../lib/api.ts";
import { viewerUser, type AdminSession, type StructureSeed } from "./types.ts";

/**
 * The content of the running example (docs/running-example.md) that the structure seed writes.
 * Everything here is invented. No text comes from a real book, quote or person.
 */

export const seriesData = {
  name: "Working Coasts",
  description: "Non-fiction about the people who kept the lights and signals of a coast.",
  authorName: "Mara Quill",
} as const;

export interface SceneData {
  title: string;
  summary: string;
  status: "outline" | "draft" | "revised";
  labels: string[];
  /** Prose in the scene body. Empty for a scene that is only outlined. */
  prose: string;
}

export interface ChapterData {
  title: string;
  summary: string;
  scenes: [SceneData, SceneData];
}

export interface ActData {
  title: string;
  chapters: [ChapterData, ChapterData];
}

export const labelData = [
  { name: "Needs research", color: "warn" },
  { name: "Ready to write", color: "ok" },
  { name: "Drafting", color: "info" },
  { name: "Maybe cut", color: "danger" },
] as const;

export const saltAndSignal = {
  title: "Salt and Signal",
  subtitle: "How one coast kept its lights",
  targetWords: 60000,
  status: "draft",
} as const;

export const tideTables = {
  title: "Tide Tables",
  subtitle: "Reading the water along Working Coasts",
  targetWords: 45000,
  status: "planning",
} as const;

export const acts: [ActData, ActData, ActData] = [
  {
    title: "The Light",
    chapters: [
      {
        title: "The Lamp Room",
        summary: "The light at Harrowmouth is built, lit and learned by the people who tend it.",
        scenes: [
          {
            title: "Lighting up",
            summary: "Edith Marrow lights the lamp for the first time as head keeper.",
            status: "revised",
            labels: [],
            prose:
              "The lamp room was cold at five in the evening. Edith Marrow climbed the ninety-one steps with the oil can in one hand and a box of matches in her pocket.\n\n" +
              "She trimmed the wick twice before she was satisfied. When the flame took, the old reflector threw a thin bar of light across the water to the far headland. The Fresnel lens was still two months away.\n",
          },
          {
            title: "The lens arrives",
            summary: "The Fresnel lens comes by cart from the railway and is lifted into the tower.",
            status: "draft",
            labels: ["Needs research", "Drafting"],
            prose:
              "The crates came off the train at Harrowmouth on a Tuesday. Each held a ring of glass wrapped in straw, and the carters would not lift one without a second pair of hands.\n\n" +
              "Tobias Venn counted the prisms twice. One was missing from the second crate, and he spent the afternoon writing letters to find it.\n",
          },
        ],
      },
      {
        title: "Oil and Brass",
        summary: "The daily routine of fuel, polish and logbook entries that keeps the light steady.",
        scenes: [
          {
            title: "The morning round",
            summary: "A keeper's morning from the last watch to the first polish of the brass.",
            status: "draft",
            labels: ["Drafting"],
            prose:
              "Morning started with the logbook. Edith wrote the hour the lamp went out, the weather, and the level of oil left in the drum.\n\n" +
              "Then came the brass. A keeper polished the rails and the lamp housing every day, because salt air turned bare metal green by the weekend.\n",
          },
          {
            title: "Counting the oil",
            summary: "What a year of fuel cost the station and who signed for it.",
            status: "outline",
            labels: ["Needs research"],
            prose: "",
          },
        ],
      },
    ],
  },
  {
    title: "The Keepers",
    chapters: [
      {
        title: "A House on the Rock",
        summary: "Families live at the station, and the children learn the work before they learn to read.",
        scenes: [
          {
            title: "Four rooms, six people",
            summary: "The keeper's cottage and how a family shared it with an assistant keeper.",
            status: "draft",
            labels: ["Drafting"],
            prose:
              "The cottage had four rooms and a stove. Six people lived there in the winter of the long storms, counting the assistant keeper and his sister.\n\n" +
              "Bread was baked on Mondays. The wind blew the smoke back down the chimney on most of them.\n",
          },
          {
            title: "Lessons by lamplight",
            summary: "The keepers' children are taught their letters from the station logbook.",
            status: "outline",
            labels: ["Ready to write"],
            prose: "",
          },
        ],
      },
      {
        title: "Tobias and the Signal Station",
        summary: "Tobias Venn rebuilds the signal station and changes how ships hear from the shore.",
        scenes: [
          {
            title: "A broken mast",
            summary: "A winter gale takes the old signal mast and Tobias Venn is sent to replace it.",
            status: "revised",
            labels: [],
            prose:
              "The mast fell on the night of the third gale. By morning it lay across the path to the boathouse, split in two at the base.\n\n" +
              "Tobias Venn came back on the Thursday boat with a toolbag and a roll of drawings. He looked at the stump for a long while before he spoke.\n",
          },
          {
            title: "Flags and horns",
            summary: "How the new station used flags by day and a horn in fog.",
            status: "outline",
            labels: ["Needs research", "Maybe cut"],
            prose: "",
          },
        ],
      },
    ],
  },
  {
    title: "The Last Watch",
    chapters: [
      {
        title: "Automation",
        summary: "Machines take over the lamp, and the keepers are told the station will be unmanned.",
        scenes: [
          {
            title: "The letter",
            summary: "A letter from the harbour board tells Edith Marrow the light will run itself.",
            status: "draft",
            labels: ["Drafting"],
            prose:
              "The letter came with the supply boat. It was two paragraphs long and used the word efficiency three times.\n\n" +
              "Edith read it standing at the kitchen table, then folded it into the logbook at the page for that day.\n",
          },
          {
            title: "Teaching the clockwork",
            summary: "The engineers fit a timer and a lamp changer, and the keepers watch them work.",
            status: "outline",
            labels: ["Needs research"],
            prose: "",
          },
        ],
      },
      {
        title: "Closing the Book",
        summary: "The final night at Harrowmouth and what remains of the station today.",
        scenes: [
          {
            title: "The last night",
            summary: "Edith Marrow keeps her final watch and writes the last entry in the logbook.",
            status: "draft",
            labels: ["Drafting"],
            prose:
              "On the last night she lit the lamp by hand, though the timer would have done it. The lens turned as it always had.\n\n" +
              "At dawn she wrote one line in the logbook and signed it. Then she carried her bag down the ninety-one steps.\n",
          },
          {
            title: "What the tower says now",
            summary: "A visit to the empty tower and the plaque that tells visitors the dates.",
            status: "outline",
            labels: [],
            prose: "",
          },
        ],
      },
    ],
  },
];

export interface EntryData {
  name: string;
  category: "People" | "Places" | "Ideas";
  aliases: string[];
  summary: string;
  body: string;
  /** Display numbers of the scenes that link to the entry. */
  scenes: string[];
}

export const categories = [
  { name: "People", colour: "category-person" },
  { name: "Places", colour: "category-story" },
  { name: "Ideas", colour: "category-research" },
] as const;

export const entries: EntryData[] = [
  {
    name: "Edith Marrow",
    category: "People",
    aliases: ["Mrs Marrow", "E. Marrow"],
    summary: "The keeper who ran the light for most of the book.",
    body: "Head keeper at Harrowmouth for thirty-one years. She kept the logbook in a small upright hand and wrote the weather first.",
    scenes: ["1.1", "2.1", "5.1", "6.1"],
  },
  {
    name: "Tobias Venn",
    category: "People",
    aliases: ["Toby Venn"],
    summary: "The engineer who rebuilt the signal station.",
    body: "Trained as a ship's carpenter. He first came to Harrowmouth to unpack the lens. He returned after the third gale to rebuild the signal station and stayed for two winters.",
    scenes: ["1.2", "4.1", "4.2"],
  },
  {
    name: "Harrowmouth",
    category: "Places",
    aliases: ["The Mouth"],
    summary: "An invented town on the coast.",
    body: "A fishing town of about four hundred people at the mouth of a tidal river. The station stands on the rock at the end of the harbour wall.",
    scenes: ["1.1", "3.1", "6.2"],
  },
  {
    name: "Fresnel lens",
    category: "Ideas",
    aliases: ["The lens", "the optic"],
    summary: "The lens in the lamp room.",
    body: "A ring of glass prisms that bends the flame's light into a single beam. The one at Harrowmouth turns once every twenty seconds.",
    scenes: ["1.1", "1.2"],
  },
];

// Checks that seed-check.ts runs against a stack. They read through the REST API only.

export interface LibraryBook {
  id: string;
  title: string;
  subtitle: string | null;
  status: string;
  targetWords: number | null;
  seriesId: string | null;
  seriesName: string | null;
  seriesNumber: number | null;
  archived: boolean;
  role: string;
}

export interface LibrarySeries {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
}

/** The Library as the person sees it: live books, or with `archivedView` the Archived list. */
export async function readLibrary(
  session: AdminSession,
  archivedView: boolean,
): Promise<{ series: LibrarySeries[]; books: LibraryBook[] }> {
  const library = await expectOk<{ series: (LibrarySeries & { books: LibraryBook[] })[]; standalone: LibraryBook[] }>(
    session,
    "GET",
    `/api/library${archivedView ? "?status=archived" : ""}`,
  );
  return {
    series: library.series.map(({ id, name, description, archived }) => ({ id, name, description, archived })),
    books: [...library.series.flatMap((series) => series.books), ...library.standalone],
  };
}

interface OutlineForCheck {
  acts: {
    title: string;
    chapters: {
      title: string;
      archived: boolean;
      scenes: { number: string; title: string | null; summary: string | null; status: string; labels: unknown[] }[];
    }[];
  }[];
}

/** StructureFieldsAllSet: every act, chapter and scene has the fields the running example lists. */
export async function assertStructureFieldsSet(session: AdminSession, seed: StructureSeed): Promise<void> {
  const problems: string[] = [];
  const bookId = seed.bookIds.saltAndSignal;

  const library = await readLibrary(session, false);
  const salt = library.books.find((b) => b.id === bookId);
  const tide = library.books.find((b) => b.id === seed.bookIds.tideTables);
  if (!salt || salt.title !== saltAndSignal.title) problems.push(`the book title is not "${saltAndSignal.title}"`);
  if (!tide || tide.title !== tideTables.title) problems.push(`the second book title is not "${tideTables.title}"`);
  for (const book of [salt, tide]) {
    if (book && (book.seriesId !== seed.seriesId || book.seriesName !== seriesData.name)) {
      problems.push(`"${book.title}" is not in the series "${seriesData.name}"`);
    }
  }
  if (!library.series.some((s) => s.id === seed.seriesId && s.name === seriesData.name)) {
    problems.push(`the series is not named "${seriesData.name}"`);
  }

  const outline = await expectOk<OutlineForCheck>(session, "GET", `/api/books/${bookId}/outline`);
  if (outline.acts.length !== 3) problems.push(`expected 3 acts, found ${outline.acts.length}`);
  if (outline.acts.map((a) => a.title).join("|") !== acts.map((a) => a.title).join("|")) {
    problems.push(`the act titles are "${outline.acts.map((a) => a.title).join('", "')}"`);
  }
  let chapters = 0;
  let scenes = 0;
  let labelled = 0;
  for (const act of outline.acts) {
    if (!act.title) problems.push("an act has no title");
    for (const chapter of act.chapters) {
      chapters++;
      if (!chapter.title || chapter.title === "New chapter") problems.push(`chapter "${chapter.title}" has no real title`);
      for (const scene of chapter.scenes) {
        scenes++;
        if (!scene.title) problems.push(`scene ${scene.number} has no title`);
        if (!scene.summary) problems.push(`scene ${scene.number} has no summary`);
        if (!scene.status || scene.status === "empty") problems.push(`scene ${scene.number} has no status`);
        if (scene.labels.length > 0) labelled++;
      }
    }
  }
  if (chapters < 6) problems.push(`expected at least 6 chapters, found ${chapters}`);
  if (scenes < 12) problems.push(`expected at least 12 scenes, found ${scenes}`);
  if (labelled === 0) problems.push("no scene has a label");
  const labels = await expectOk<{ name: string }[]>(session, "GET", `/api/books/${bookId}/labels`);
  if (!labels.some((l) => l.name === "Needs research")) problems.push('label "Needs research" is missing');

  const kb = await expectOk<{ entries: { id: string; name: string; summary: string; aliases?: string[] }[] }>(
    session,
    "GET",
    `/api/books/${bookId}/kb`,
  );
  for (const entry of entries) {
    const found = kb.entries.find((e) => e.name === entry.name);
    if (!found) {
      problems.push(`entry "${entry.name}" is missing`);
      continue;
    }
    const full = await expectOk<{ summary: string; body: string; aliases: string[]; categoryName: string }>(
      session,
      "GET",
      `/api/kb/entries/${found.id}`,
    );
    if (!full.summary || !full.body) problems.push(`entry "${entry.name}" lacks a summary or body`);
    if (entry.aliases.some((alias) => !full.aliases.includes(alias))) problems.push(`entry "${entry.name}" lacks an alias`);
    if (full.categoryName !== entry.category) problems.push(`entry "${entry.name}" is in "${full.categoryName}", not "${entry.category}"`);
  }
  const users = await expectOk<{ id: string; email: string }[]>(session, "GET", "/api/admin/users");
  const viewer = users.find((u) => u.id === seed.viewer.id);
  if (!viewer) problems.push("the viewer user does not exist");
  else if (viewer.email.toLowerCase() !== viewerUser.email) problems.push("the viewer has the wrong email");
  if (problems.length > 0) throw new Error(`StructureFieldsAllSet: ${problems.join("; ")}`);
}

interface OutlineForSnapshot {
  acts: {
    id: string;
    title: string;
    chapters: {
      id: string;
      number: number | null;
      title: string;
      archived: boolean;
      scenes: {
        id: string;
        number: string;
        title: string | null;
        summary: string | null;
        status: string;
        labels: { name: string; color: string | null }[];
        linkedEntries: { name: string }[];
      }[];
    }[];
  }[];
}

/**
 * Everything restoreStructure promises to put back, as one string to compare. It keeps the order of acts, chapters
 * and scenes and their display numbers, and leaves out `position`, because every move writes a new key.
 */
export async function snapshotStructure(session: AdminSession, seed: StructureSeed): Promise<string> {
  const bookId = seed.bookIds.saltAndSignal;
  const outline = await expectOk<OutlineForSnapshot>(session, "GET", `/api/books/${bookId}/outline`);
  const tree = outline.acts.map((act) => ({
    id: act.id,
    title: act.title,
    chapters: act.chapters.map((chapter) => ({
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      archived: chapter.archived,
      scenes: chapter.scenes.map((scene) => ({
        id: scene.id,
        number: scene.number,
        title: scene.title,
        summary: scene.summary,
        status: scene.status,
        labels: scene.labels.map((l) => `${l.name}/${l.color}`).sort(),
        linkedEntries: scene.linkedEntries.map((e) => e.name).sort(),
      })),
    })),
  }));

  const labels = await expectOk<{ scopeId: string; name: string; color: string | null }[]>(
    session,
    "GET",
    `/api/books/${bookId}/labels`,
  );
  const kb = await expectOk<{ entries: { id: string; fromSeries: boolean }[] }>(session, "GET", `/api/books/${bookId}/kb`);
  const full = [];
  for (const entry of kb.entries) {
    const e = await expectOk<Record<string, unknown>>(session, "GET", `/api/kb/entries/${entry.id}`);
    const name = String(e.name);
    full.push({
      name,
      idIsSeeded: seed.entryIds[name] === entry.id,
      category: e.categoryName,
      summary: e.summary,
      body: e.body,
      aliases: e.aliases,
      tags: e.tags,
      alwaysInContext: e.alwaysInContext,
      fields: e.fields,
      usedIn: e.usedIn,
    });
  }
  full.sort((a, b) => a.name.localeCompare(b.name));

  const prose: Record<string, string> = {};
  for (const [number, id] of Object.entries(seed.sceneIds)) {
    prose[number] = (await expectOk<{ body: string }>(session, "GET", `/api/scenes/${id}/prose`)).body;
  }

  const library = [await readLibrary(session, false), await readLibrary(session, true)].map((view) => ({
    series: view.series,
    books: view.books
      .map(({ role: _role, ...book }) => book)
      .sort((a, b) => a.title.localeCompare(b.title)),
  }));

  return JSON.stringify({
    tree,
    labels: labels.filter((l) => l.scopeId === bookId).map((l) => `${l.name}/${l.color}`),
    entries: full,
    prose,
    library,
  });
}

/**
 * Changes what a shot spec might change, so a restore has something to undo. After each change the snapshot must
 * differ from the one before, so a change that did not register fails here and not as a silent pass.
 */
export async function disturbStructure(session: AdminSession, seed: StructureSeed): Promise<void> {
  const bookId = seed.bookIds.saltAndSignal;
  let last = await snapshotStructure(session, seed);
  const step = async (name: string, change: () => Promise<unknown>): Promise<void> => {
    await change();
    const next = await snapshotStructure(session, seed);
    if (next === last) throw new Error(`The disturbance "${name}" changed nothing.`);
    last = next;
  };
  const scene = (number: string) => seed.sceneIds[number]!;
  const move = (path: string, body: unknown) => expectOk(session, "PUT", path, body);

  await step("rename a scene, change its status and prose", async () => {
    await expectOk(session, "PATCH", `/api/scenes/${scene("1.1")}`, { title: "Changed by a spec", status: "final" });
    const prose = await expectOk<{ version: number }>(session, "GET", `/api/scenes/${scene("1.1")}/prose`);
    await expectOk(session, "PUT", `/api/scenes/${scene("1.1")}/prose`, { body: "Changed.\n", version: prose.version });
  });
  await step("archive a scene", () => expectOk(session, "POST", `/api/scenes/${scene("4.2")}/archive`));
  await step("move a scene to another chapter", () =>
    move(`/api/scenes/${scene("5.2")}/position`, { chapterId: seed.chapterIds["6"], afterId: scene("6.1") }));
  await step("move a scene inside its chapter", () =>
    move(`/api/scenes/${scene("1.1")}/position`, { chapterId: seed.chapterIds["1"], afterId: scene("1.2") }));
  await step("move a chapter to another act", () =>
    move(`/api/chapters/${seed.chapterIds["3"]}/position`, { actId: seed.actIds["The Light"], afterId: null }));
  await step("move an act", () => move(`/api/acts/${seed.actIds["The Last Watch"]}/position`, { afterId: null }));
  await step("rename a chapter", () =>
    expectOk(session, "PATCH", `/api/chapters/${seed.chapterIds["2"]}`, { title: "Changed chapter" }));
  await step("rename an act", () =>
    expectOk(session, "PATCH", `/api/acts/${seed.actIds["The Light"]}`, { title: "Changed act" }));
  await step("archive an act", () => expectOk(session, "POST", `/api/acts/${seed.actIds["The Keepers"]}/archive`));

  const labels = await expectOk<{ id: string; name: string }[]>(session, "GET", `/api/books/${bookId}/labels`);
  const research = labels.find((l) => l.name === "Needs research")!;
  await step("rename and recolour a label", () =>
    expectOk(session, "PATCH", `/api/labels/${research.id}`, { name: "Renamed label", color: "danger" }));
  await step("add a label", () =>
    expectOk(session, "POST", `/api/books/${bookId}/labels`, { name: "Extra label", color: "info" }));

  await step("add a scene-entry link", () =>
    expectOk(session, "POST", `/api/scenes/${scene("2.2")}/kb`, { entryId: seed.entryIds["Edith Marrow"] }));
  await step("remove a scene-entry link", () =>
    expectOk(session, "DELETE", `/api/scenes/${scene("1.2")}/kb/${seed.entryIds["Fresnel lens"]}`));

  const kb = await expectOk<{ categories: { id: string; name: string }[] }>(session, "GET", `/api/books/${bookId}/kb`);
  const category = (name: string) => kb.categories.find((c) => c.name === name)!.id;
  await step("add an entry", () =>
    expectOk(session, "POST", `/api/books/${bookId}/kb/entries`, { categoryId: category("People"), name: "Extra entry" }));
  await step("change an entry", () =>
    expectOk(session, "PATCH", `/api/kb/entries/${seed.entryIds["Edith Marrow"]}`, { summary: "Changed.", aliases: [] }));
  await step("move an entry to another category and set its flags", () =>
    expectOk(session, "PATCH", `/api/kb/entries/${seed.entryIds["Tobias Venn"]}`, {
      categoryId: category("Places"),
      alwaysInContext: true,
      tags: ["changed"],
    }));
  await step("delete a seeded entry", async () => {
    await expectOk(session, "DELETE", `/api/kb/entries/${seed.entryIds["Harrowmouth"]}`);
  });

  await step("change book fields", () =>
    expectOk(session, "PATCH", `/api/books/${bookId}/settings`, { title: "Changed book", status: "writing", targetWords: 1000 }));
  await step("change series fields", () =>
    expectOk(session, "PATCH", `/api/series/${seed.seriesId}`, { name: "Changed series", description: "Changed." }));
  await step("add an extra book", () => expectOk(session, "POST", "/api/books", { title: "Extra book" }));
}
