import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSeed } from "./seed.ts";
import type { AdminSession, SeedResult } from "./types.ts";

const session = { baseUrl: "http://test" } as AdminSession;

test("SeedComposesBothModules", async () => {
  const calls: string[] = [];
  const seed = composeSeed({
    async seedStructure(s) {
      calls.push("seedStructure");
      assert.equal(s, session);
      return {
        seriesId: "s",
        bookIds: { saltAndSignal: "b1", tideTables: "b2" },
        sceneIds: { "1.1": "sc" },
        entryIds: { E: "e" },
        viewer: { id: "v", email: "v@x" },
        aiIntegrationId: "ai",
        templateSlug: "t",
      };
    },
    async seedReferences(s, book) {
      calls.push("seedReferences");
      assert.equal(s, session);
      assert.deepEqual(book, { id: "b1", sceneIds: { "1.1": "sc" }, entryIds: { E: "e" } });
      return { sourceIds: { S: "src" }, useIds: { u: "use" } };
    },
    async restoreStructure(_s, r) {
      calls.push(`restoreStructure:${r.seriesId}`);
    },
    async restoreReferences(_s, r) {
      calls.push(`restoreReferences:${Object.keys(r.sourceIds)}`);
    },
  });

  const result = await seed.seedDemo(session);
  assert.deepEqual(calls, ["seedStructure", "seedReferences"]);
  assert.deepEqual(Object.keys(result).sort(), [
    "aiIntegrationId", "bookIds", "entryIds", "sceneIds", "seriesId", "sourceIds", "templateSlug", "useIds", "viewer",
  ]);

  await seed.restoreFixtures(session, result as SeedResult);
  assert.deepEqual(calls.slice(2), ["restoreStructure:s", "restoreReferences:S"]);
});
