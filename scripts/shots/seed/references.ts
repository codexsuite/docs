import type { AdminSession, ReferencesSeed, SeedBook, SeedResult } from "../types.ts";

// TODO: replace with the real seed: the two sources, their uses, and the quote over the
// publisher's word limit. This stub returns fixed fake ids and calls nothing.
export async function seedReferences(_session: AdminSession, _book: SeedBook): Promise<ReferencesSeed> {
  return {
    sourceIds: { "The Keeper's Ledger": "stub-source-ledger", "Signals at Sea": "stub-source-signals" },
    useIds: { ledger: "stub-use-ledger" },
  };
}

// TODO: replace with the real restore: put sources and uses back to the state seedReferences left.
export async function restoreReferences(_session: AdminSession, _seed: SeedResult): Promise<void> {}
