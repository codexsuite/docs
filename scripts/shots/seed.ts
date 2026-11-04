import type { AdminSession, ReferencesSeed, SeedBook, SeedResult, StructureSeed } from "./types.ts";
import { restoreReferences, seedReferences } from "./seed/references.ts";
import { restoreStructure, seedStructure } from "./seed/structure.ts";

/** The four calls this file composes. Tests pass fakes. */
export interface SeedModules {
  seedStructure(session: AdminSession): Promise<StructureSeed>;
  restoreStructure(session: AdminSession, seed: SeedResult): Promise<void>;
  seedReferences(session: AdminSession, book: SeedBook): Promise<ReferencesSeed>;
  restoreReferences(session: AdminSession, seed: SeedResult): Promise<void>;
}

/**
 * Composition only. Structure runs first, then references on Salt and Signal.
 * Restore runs in the same order. Data lives in seed/structure.ts and seed/references.ts.
 */
export function composeSeed(modules: SeedModules) {
  return {
    async seedDemo(session: AdminSession): Promise<SeedResult> {
      const structure = await modules.seedStructure(session);
      const references = await modules.seedReferences(session, {
        id: structure.bookIds.saltAndSignal,
        sceneIds: structure.sceneIds,
        entryIds: structure.entryIds,
      });
      return { ...structure, ...references };
    },
    async restoreFixtures(session: AdminSession, seed: SeedResult): Promise<void> {
      await modules.restoreStructure(session, seed);
      await modules.restoreReferences(session, seed);
    },
  };
}

const demo = composeSeed({ seedStructure, restoreStructure, seedReferences, restoreReferences });

/** Contract 5. Works on an empty database through the REST API only. */
export const seedDemo: (session: AdminSession) => Promise<SeedResult> = demo.seedDemo;
export const restoreFixtures: (session: AdminSession, seed: SeedResult) => Promise<void> = demo.restoreFixtures;
