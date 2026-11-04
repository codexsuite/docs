/**
 * CaddyExampleValidates. Runs `caddy validate` on examples/caddy/Caddyfile and checks that the file
 * sends the forwarded scheme and host the Secure cookie needs. It runs in CI
 * (.github/workflows/caddy-check.yml) with the caddy:2 image, or on a machine that has `caddy` on PATH.
 *
 *   tsx scripts/checks/caddy.ts            validate with the caddy:2 image
 *   tsx scripts/checks/caddy.ts --binary   validate with `caddy` on PATH
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const caddyfile = `${root}/examples/caddy/Caddyfile`;

/** The header lines the Caddyfile must set so Codex sees https and the public host name. */
export function missingForwardedHeaders(source: string): string[] {
  const lines = source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !l.startsWith("#"));
  return ["X-Forwarded-Proto", "X-Forwarded-Host"].filter(
    (name) => !lines.some((l) => l.startsWith("header_up") && l.includes(name)),
  );
}

function validate(useBinary: boolean): number {
  const env = { ...process.env, CODEX_DOMAIN: "docs-example.test" };
  const args = useBinary
    ? ["caddy", ["validate", "--config", caddyfile, "--adapter", "caddyfile"]]
    : [
        "docker",
        [
          "run", "--rm", "-e", "CODEX_DOMAIN=docs-example.test",
          "-v", `${caddyfile}:/etc/caddy/Caddyfile:ro`,
          "caddy:2", "caddy", "validate", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile",
        ],
      ];
  const result = spawnSync(args[0] as string, args[1] as string[], { env, stdio: "inherit" });
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const missing = missingForwardedHeaders(readFileSync(caddyfile, "utf8"));
  if (missing.length > 0) {
    console.log(`FAIL CaddyExampleValidates: the Caddyfile does not set ${missing.join(", ")}`);
    process.exit(1);
  }
  const status = validate(process.argv.includes("--binary"));
  console.log(status === 0 ? "PASS CaddyExampleValidates" : "FAIL CaddyExampleValidates: caddy validate failed");
  process.exit(status);
}
