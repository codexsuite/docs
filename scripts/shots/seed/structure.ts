import type { AdminSession, SeedResult, StructureSeed } from "../types.ts";

// TODO: replace with the real seed: series, books, acts, chapters, scenes, labels,
// knowledge base entries, the viewer user, the AI integration and the pending draft.
// This stub returns fixed fake ids and calls nothing.
export async function seedStructure(_session: AdminSession): Promise<StructureSeed> {
  return {
    seriesId: "stub-series",
    bookIds: { saltAndSignal: "stub-book-salt", tideTables: "stub-book-tide" },
    sceneIds: { "1.1": "stub-scene-1-1", "1.2": "stub-scene-1-2" },
    entryIds: { "Edith Marrow": "stub-entry-edith" },
    viewer: { id: "stub-viewer", email: "viewer@example.test" },
    aiIntegrationId: "stub-ai",
    templateSlug: "novel-6x9",
  };
}

// TODO: replace with the real restore: put the structure back to the state seedStructure left.
export async function restoreStructure(_session: AdminSession, _seed: SeedResult): Promise<void> {}
