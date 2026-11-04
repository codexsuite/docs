import type { AdminSession, ReferencesSeed, SeedBook, SeedResult } from "../types.ts";

// TODO: replace with the real seed: the two sources, their uses, the quote over the
// publisher's word limit, the AI integration, the pending draft and the print template.
// This stub returns fixed fake ids and calls nothing.
export async function seedReferences(_session: AdminSession, _book: SeedBook): Promise<ReferencesSeed> {
  return {
    sourceIds: { "The Keeper's Ledger": "stub-source-ledger", "Signals at Sea": "stub-source-signals" },
    useIds: { ledger: "stub-use-ledger" },
    aiIntegrationId: "stub-ai",
    templateSlug: "novel-6x9",
  };
}

// TODO: replace with the real restore: put sources and uses back to the state seedReferences left.
export async function restoreReferences(_session: AdminSession, _seed: SeedResult): Promise<void> {}
