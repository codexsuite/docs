/**
 * Proves the quick start on a machine with Docker, with the published images and an empty database.
 * It runs in CI (.github/workflows/quickstart-check.yml). Never run it on a host without Docker.
 *
 *   tsx scripts/checks/quickstart.ts            all checks
 *   tsx scripts/checks/quickstart.ts --hold     start the stack, print READY and wait (used by the interrupt check)
 *
 * It prints check names and status codes only. It never prints a credential, a cookie, a token or a response body.
 */
import { spawn, spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { codexImage, workerImage } from "../../src/config/site.ts";
import { createToken, expectOk, signInFromFile } from "../lib/api.ts";
import { down, up } from "../lib/stack.ts";
import type { AdminSession } from "../shots/types.ts";

const results: { name: string; ok: boolean; note: string }[] = [];

async function check(name: string, body: () => Promise<string | void>): Promise<boolean> {
  try {
    const note = (await body()) ?? "";
    results.push({ name, ok: true, note });
    console.log(`PASS ${name}${note ? ` (${note})` : ""}`);
    return true;
  } catch (error) {
    const note = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, note });
    console.log(`FAIL ${name}: ${note}`);
    return false;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The one-line sandbox check the install pages print. It runs from the worker image and needs Landlock ABI 4. */
export const sandboxCheckArgs = (image: string) => [
  "run", "--rm", "--entrypoint", "codex-sandbox", image, "--exec", "/usr", "--", "/usr/bin/true",
];

async function hold(): Promise<void> {
  const stack = await up({ project: process.env.CODEX_DOCS_STACK_PROJECT, override: true });
  console.log(`READY ${stack.project}`);
  await sleep(10 * 60_000);
}

async function main(): Promise<void> {
  const workerRef = `${workerImage}:latest`;
  const webRef = `${codexImage}:latest`;
  console.log(`images: ${webRef} ${workerRef}`);

  // The check that the install pages print, run first so a host without Landlock ABI 4 fails here with the sandbox's own words.
  await check("SandboxCheckCommandWorks", async () => {
    const result = spawnSync("docker", sandboxCheckArgs(workerRef), { encoding: "utf8" });
    // Landlock ABI numbers and refusals are not secrets. The sandbox prints them on stderr.
    if (result.status !== 0) {
      throw new Error(`exit ${result.status}: ${(result.stderr ?? "").trim().split("\n").slice(-3).join(" | ")}`);
    }
  });

  const stack = await up({ override: true });
  let session: AdminSession | undefined;

  await check("HealthReturnsVersion", async () => {
    const response = await fetch(`${stack.baseUrl}/health`);
    assert(response.status === 200, `GET /health answered ${response.status}`);
    const body = (await response.json()) as { status?: string; version?: string };
    assert(body.status === "ok", "health status is not ok");
    assert(typeof body.version === "string" && body.version.length > 0, "health has no version");
    return `version ${body.version}`;
  });

  await check("QuickStartReachesSignedInAdmin", async () => {
    session = await signInFromFile(stack.baseUrl, stack.credentialsFile);
    const me = await expectOk<{ isAdmin: boolean }>(session, "GET", "/api/auth/me");
    assert(me.isAdmin === true, "the first admin is not an admin");
  });

  if (session) {
    const s = session;
    await check("FakeModelAnswersConnectionTest", async () => {
      const test = await expectOk<{ ok: boolean; models: string[]; error: string | null }>(
        s, "POST", "/api/ai/integrations/test",
        { kind: "openai_compatible", baseUrl: "http://fake-model:4010/v1", apiKey: "fake-key" },
      );
      assert(test.ok, `connection test failed: ${test.error ?? "no message"}`);
      assert(test.models.includes("fake-model"), "the model list lacks fake-model");
    });

    await check("DraftFinishesThroughFakeModel", async () => {
      const integration = await expectOk<{ id: string }>(s, "POST", "/api/ai/integrations", {
        kind: "openai_compatible",
        label: "Fake model",
        baseUrl: "http://fake-model:4010/v1",
        apiKey: "fake-key",
        defaultModel: "fake-model",
      });
      const book = await expectOk<{ id: string }>(s, "POST", "/api/books", { title: "Draft proof" });
      const act = await expectOk<{ chapters: { scenes: { id: string }[] }[] }>(
        s, "POST", `/api/books/${book.id}/acts`, { title: "Act one" },
      );
      const sceneId = act.chapters[0]?.scenes[0]?.id;
      assert(sceneId, "the new act has no scene");
      const response = await s.api("POST", `/api/scenes/${sceneId}/continue`, {
        model: "fake-model",
        integrationId: integration.id,
      });
      assert(response.status === 200, `POST continue answered ${response.status}`);
      const events = (await response.text())
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as { text?: string; final?: { words: number }; error?: { code?: string; message?: string } });
      const failure = events.find((e) => e.error);
      assert(!failure, `the draft stream ended with an error: ${failure?.error?.code ?? ""} ${failure?.error?.message ?? ""}`);
      const final = events.find((e) => e.final);
      assert(final && final.final!.words > 0, "the draft stream had no final event with words");
      const drafts = await expectOk<{ drafts: { status: string; text: string }[] }>(s, "GET", `/api/books/${book.id}/drafts`);
      assert(drafts.drafts.some((d) => d.status === "pending" && d.text.length > 0), "no pending draft with text after the stream");
      return `${final.final!.words} words`;
    });

    await check("PdfExportSucceedsThroughWorker", async () => {
      const book = await expectOk<{ id: string }>(s, "POST", "/api/books", { title: "Quick start proof" });
      const act = await expectOk<{ chapters: { scenes: { id: string }[] }[] }>(
        s, "POST", `/api/books/${book.id}/acts`, { title: "Act one" },
      );
      const sceneId = act.chapters[0]?.scenes[0]?.id;
      assert(sceneId, "the new act has no scene");
      const prose = await expectOk<{ version: number }>(s, "GET", `/api/scenes/${sceneId}/prose`);
      await expectOk(s, "PUT", `/api/scenes/${sceneId}/prose`, {
        body: "The lamp turned slowly over Harrowmouth. Edith Marrow counted the flashes until dawn.\n",
        version: prose.version,
      });
      let job = await expectOk<{ id: string; status: string; error: string | null; log: string | null }>(
        s, "POST", `/api/books/${book.id}/exports`, { draft: true },
      );
      const deadline = Date.now() + 240_000;
      while (["queued", "running"].includes(job.status) && Date.now() < deadline) {
        await sleep(3000);
        job = await expectOk(s, "GET", `/api/exports/${job.id}`);
      }
      assert(job.status === "succeeded", `export ended as "${job.status}": ${job.error ?? "no error text"}`);
      const file = await s.api("GET", `/api/exports/${job.id}/file`);
      assert(file.status === 200, `GET export file answered ${file.status}`);
      const bytes = Buffer.from(await file.arrayBuffer());
      assert(bytes.subarray(0, 4).toString("latin1") === "%PDF", "the file does not start with %PDF");
      return `${bytes.length} bytes`;
    });

    let token = "";
    await check("ToolCallSucceedsOverMcpWithToken", async () => {
      token = (await createToken(s, "docs quickstart check")).secret;
      const client = new Client({ name: "docs-quickstart-check", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(`${stack.baseUrl}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      });
      await client.connect(transport);
      try {
        const result = await client.callTool({ name: "list_books", arguments: {} });
        assert(!result.isError, "list_books returned an error");
        const text = JSON.stringify(result.content);
        assert(text.includes("Quick start proof"), "list_books does not list the book created through the API");
      } finally {
        await client.close();
      }
    });
  }

  await check("MissingTokenGets401", async () => {
    const response = await fetch(`${stack.baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert(response.status === 401, `POST /mcp without a token answered ${response.status}`);
  });

  down();

  await check("StackRemovedOnInterruption", interruptCheck);
}

/** Starts the stack in a child process, interrupts it, and expects no container, volume or network to remain. */
async function interruptCheck(): Promise<void> {
  const project = "codex-docs-interrupt";
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/checks/quickstart.ts", "--hold"], {
    env: { ...process.env, CODEX_DOCS_STACK_PROJECT: project },
    stdio: ["ignore", "pipe", "inherit"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  const deadline = Date.now() + 300_000;
  while (!output.includes("READY") && child.exitCode === null && Date.now() < deadline) await sleep(1000);
  assert(output.includes("READY"), "the stack did not come up in the child process");
  child.kill("SIGINT");
  const exited = await new Promise<boolean>((resolvePromise) => {
    const timer = setTimeout(() => resolvePromise(false), 120_000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolvePromise(true);
    });
  });
  assert(exited, "the child did not exit after SIGINT");
  const label = `label=com.docker.compose.project=${project}`;
  const left = ["ps", "volume ls", "network ls"].map((command) => {
    const args = command === "ps" ? ["ps", "-aq", "--filter", label] : [...command.split(" "), "-q", "--filter", label];
    return spawnSync("docker", args, { encoding: "utf8" }).stdout.trim();
  });
  assert(left.every((out) => out === ""), "the interrupted stack left a container, volume or network behind");
}

const mode = process.argv[2];
(mode === "--hold" ? hold() : main())
  .then(() => {
    if (mode === "--hold") return;
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
    process.exit(failed.length ? 1 : 0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    down();
    process.exit(1);
  });
