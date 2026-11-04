import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { assertNoSecrets, encodeWebp, loadSpecs, maxBytes, parseArgs } from "./runner.ts";

test("ParseArgsReadsPageShotAndNoStack", () => {
  const o = parseArgs(["--page", "ui-write", "--shot", "ui-write-focus", "--no-stack", "http://x", "--credentials", "/tmp/c.json"]);
  assert.equal(o.page, "ui-write");
  assert.equal(o.shot, "ui-write-focus");
  assert.equal(o.noStack, "http://x");
  assert.throws(() => parseArgs(["--page", "a", "--no-stack", "http://x"]), /credentials/);
  assert.throws(() => parseArgs([]), /Usage/);
});

test("ShotsAreUnder150KB", async () => {
  // Noise is the worst case for a webp encoder.
  const raw = Buffer.alloc(1440 * 900 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  const png = await sharp(raw, { raw: { width: 1440, height: 900, channels: 3 } }).png().toBuffer();
  await assert.rejects(encodeWebp(png, "noise"), /stays over 150 KB/);
  const flat = await sharp({ create: { width: 1440, height: 900, channels: 3, background: "#ccd" } }).png().toBuffer();
  assert.ok((await encodeWebp(flat, "flat")).length < maxBytes);
});

test("CapturePrintsNoCredentials", () => {
  assert.throws(() => assertNoSecrets("signed in with hunter2hunter2", ["hunter2hunter2"]), /credential/);
  assert.doesNotThrow(() => assertNoSecrets("Seeded the demo in 3.1 s.", ["hunter2hunter2"]));
});

test("SpecsAreNamedByPageAndUnique", async () => {
  const smoke = await loadSpecs("_smoke");
  assert.deepEqual(smoke.map((s) => s.name), ["_smoke-library"]);
  await assert.rejects(loadSpecs("nope"), /No spec for page/);
});
