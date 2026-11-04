import { restoreSnapshot, snapshot } from "../lib/stack.ts";
import { seedReferences } from "./seed/references.ts";
import { seedStructure } from "./seed/structure.ts";
import type { AdminSession, ReferencesSeed, SeedBook, SeedResult, StructureSeed } from "./types.ts";

/** The four calls this file composes. Tests pass fakes. */
export interface SeedModules {
  seedStructure(session: AdminSession): Promise<StructureSeed>;
  seedReferences(session: AdminSession, book: SeedBook): Promise<ReferencesSeed>;
  snapshot(): Promise<void>;
  restoreSnapshot(): Promise<void>;
}

/**
 * This function only composes the two seed modules and the snapshot. Structure runs first, then references on
 * Salt and Signal, then the snapshot. A restore does not call the REST API: it puts the database and the blob folder
 * back, so every id in the seed stays valid.
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
      await modules.snapshot();
      return { ...structure, ...references };
    },
    async restoreFixtures(_session: AdminSession, _seed: SeedResult): Promise<void> {
      await modules.restoreSnapshot();
    },
  };
}

const demo = composeSeed({ seedStructure, seedReferences, snapshot, restoreSnapshot });

/** Contract 5. Works on an empty database through the REST API only, then takes the snapshot (needs the stack from `up()`). */
export const seedDemo: (session: AdminSession) => Promise<SeedResult> = demo.seedDemo;
/** Puts the database and the blob folder back to the moment after the seed. The arguments stay for callers. */
export const restoreFixtures: (session: AdminSession, seed: SeedResult) => Promise<void> = demo.restoreFixtures;
