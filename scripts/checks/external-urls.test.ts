import { test } from "node:test";
import assert from "node:assert/strict";
import { externalUrlsIn, isCaptureStackUrl, isDeadLink } from "./site/external-urls.ts";

test("CaptureStackUrlsAreNotPublicLinks", () => {
  assert.equal(isCaptureStackUrl("http://fake-model:4010/v1"), true);
  assert.equal(isCaptureStackUrl("http://fake-model:4010/v2"), true);
  assert.equal(isCaptureStackUrl("https://fake-model.example.com/v1"), false);
});

test("ExternalUrlsIgnoreCodeAndKeepLinks", () => {
  const text = [
    "See [the docs](https://example.org/docs) and https://platform.example.net/keys.",
    "Set `https://api.example.net/v1` as the base URL.",
    "```text",
    "curl http://seq:5341/api",
    "```",
    "~~~",
    "http://localhost:9999",
    "~~~",
    "Done.",
  ].join("\n");
  assert.deepEqual(externalUrlsIn(text), ["https://example.org/docs", "https://platform.example.net/keys"]);
});

test("ExternalUrlsCountOnlyDeadStatuses", () => {
  for (const status of [404, 410]) assert.equal(isDeadLink(status), true, String(status));
  for (const status of [200, 301, 401, 403, 405, 429, 451, 500, 503]) assert.equal(isDeadLink(status), false, String(status));
  assert.equal(isDeadLink({ code: "ENOTFOUND" }), true);
  for (const code of ["ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", undefined]) {
    assert.equal(isDeadLink({ code }), false, String(code));
  }
});
