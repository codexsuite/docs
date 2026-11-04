import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPage } from "./page.ts";
import { makeRoot, page, pageA } from "./fixture.ts";

const run = (body: string) =>
  checkPage("a", { root: makeRoot({ "src/content/docs/a.mdx": page("Page A", 1, body) }), pages: [pageA] }, (c) => c.name === "dev-content").map(
    (p) => p.message,
  );

test("DevContentCheckFailsOnGitClone", () => {
  const messages = run(["```bash", "git clone https://github.com/codexsuite/codex.git", "```"].join("\n"));
  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /git clone/);
});

test("DevContentCheckFailsOnEachDeveloperPattern", () => {
  const lines = [
    "dotnet run --project src/Codex.Api",
    "pnpm install",
    "npm run build",
    "./db-reset.sh",
    "docker compose up --build",
    "docker build -t codex .",
    "Build from source first.",
    "Use the dev database.",
    "Run the tests before you start.",
    "See the contributing guide.",
    "Edit src/docker-compose.yml.",
  ];
  for (const line of lines) assert.equal(run(line).length, 1, line);
});

test("DevContentCheckPassesOperatorCommands", () => {
  const body = ["```bash", "docker compose up -d", "docker compose logs codex", "docker pull ghcr.io/codexsuite/codex:latest", "```", "Run Codex with the published images."].join("\n");
  assert.deepEqual(run(body), []);
});
