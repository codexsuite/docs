/**
 * Runs the demo seed modules against a real stack with an empty database. It runs in CI
 * (.github/workflows/seed-check.yml). Never run it on a host without Docker.
 *
 *   tsx scripts/checks/seed-check.ts --part structure|references|all
 *
 * The check is red while a module is still the stub, because the stub returns ids that are not UUIDs.
 */
import { signInFromFile, expectOk } from "../lib/api.ts";
import { down, up } from "../lib/stack.ts";
import { seedDemo, restoreFixtures } from "../shots/seed.ts";
import { seedStructure, restoreStructure } from "../shots/seed/structure.ts";
import { assertStructureFieldsSet, disturbStructure, snapshotStructure } from "../shots/demo-book.ts";
import type { SeedResult } from "../shots/types.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string): never {
  throw new Error(message);
}

function requireIds(label: string, ids: Record<string, string>, minimum: number): void {
  const entries = Object.entries(ids);
  if (entries.length < minimum) fail(`${label} has ${entries.length} ids, expected at least ${minimum}.`);
  for (const [name, id] of entries) if (!uuid.test(id)) fail(`${label} "${name}" is not a UUID.`);
}

function requireId(label: string, id: string | undefined): void {
  if (!id || !uuid.test(id)) fail(`${label} is not a UUID.`);
}

async function main(): Promise<void> {
  const part = process.argv[process.argv.indexOf("--part") + 1];
  if (part !== "structure" && part !== "references" && part !== "all") {
    fail("Usage: seed-check.ts --part structure|references|all");
  }
  const stack = await up({ override: true });
  const session = await signInFromFile(stack.baseUrl, stack.credentialsFile);

  if (part === "structure") {
    const structure = await seedStructure(session);
    requireId("seriesId", structure.seriesId);
    requireId("Salt and Signal", structure.bookIds.saltAndSignal);
    requireId("Tide Tables", structure.bookIds.tideTables);
    requireIds("sceneIds", structure.sceneIds, 12);
    requireIds("entryIds", structure.entryIds, 4);
    requireId("viewer", structure.viewer.id);
    await expectOk(session, "GET", `/api/books/${structure.bookIds.saltAndSignal}/outline`);
    await assertStructureFieldsSet(session, structure);
    const before = await snapshotStructure(session, structure);
    await disturbStructure(session, structure);
    if ((await snapshotStructure(session, structure)) === before) fail("The disturbance changed nothing.");
    await restoreStructure(session, { ...structure } as SeedResult);
    if ((await snapshotStructure(session, structure)) !== before) fail("SeedIsRepeatableAfterRestore: the snapshot differs after restore.");
    await assertStructureFieldsSet(session, structure);
    console.log("PASS structure");
    return;
  }

  // The references module needs a book, so it runs on the structure module's output, or on the whole seed.
  const seed: SeedResult = await seedDemo(session);
  requireIds("sourceIds", seed.sourceIds, 2);
  requireIds("useIds", seed.useIds, 1);
  requireId("aiIntegrationId", seed.aiIntegrationId);
  if (seed.templateSlug !== "novel-6x9") fail("templateSlug is not novel-6x9.");
  if (part === "all") {
    requireIds("sceneIds", seed.sceneIds, 12);
    requireIds("entryIds", seed.entryIds, 4);
    await restoreFixtures(session, seed);
  }
  console.log(`PASS ${part}`);
}

main()
  .then(() => {
    down();
    process.exit(0);
  })
  .catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    down();
    process.exit(1);
  });
