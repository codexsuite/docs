import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { missingForwardedHeaders } from "./caddy.ts";

const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");

test("the Caddyfile sets the forwarded scheme and host", () => {
  assert.deepEqual(missingForwardedHeaders(readFileSync(`${root}/examples/caddy/Caddyfile`, "utf8")), []);
});

test("a Caddyfile without the forwarded headers is reported", () => {
  assert.deepEqual(missingForwardedHeaders("example.com {\n\treverse_proxy codex:8080\n}\n"), [
    "X-Forwarded-Proto",
    "X-Forwarded-Host",
  ]);
  assert.deepEqual(missingForwardedHeaders("x {\n\t# header_up X-Forwarded-Proto {scheme}\n}\n").length, 2);
});
