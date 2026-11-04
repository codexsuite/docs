import { spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const composeFile = join(repoRoot, "examples/quickstart/docker-compose.yml");
const stackDir = join(repoRoot, "scripts/stack");

export interface StackOptions {
  /** Compose project name. Lowercase letters, digits and dashes. Defaults to a name with the process id. */
  project?: string;
  /** Adds scripts/stack/override.yml: the fake model and local AI endpoints. Capture and the fake model checks set it. Left out, the stack is the quick start file alone. */
  override?: boolean;
  /** Extra environment for compose, such as CODEX_IMAGE. Never put a secret on a command line. */
  env?: Record<string, string>;
  /** How long to wait for /health. Default 240000. */
  healthTimeoutMs?: number;
}

export interface Stack {
  project: string;
  baseUrl: string;
  /** A private 0600 JSON file with adminEmail and adminPassword, outside the repo. */
  credentialsFile: string;
}

interface Running extends Stack {
  composeEnv: NodeJS.ProcessEnv;
  files: string[];
  dir: string;
}

let running: Running | undefined;
let hooked = false;

function composeArgs(r: Pick<Running, "project" | "files">, args: string[]): string[] {
  return ["compose", "-p", r.project, ...r.files.flatMap((f) => ["-f", f]), ...args];
}

function newPassword(): string {
  // Letters and digits only, because the password goes into a connection string.
  return randomBytes(18).toString("base64").replace(/[^A-Za-z0-9]/g, "x");
}

/**
 * Starts the quick-start stack (plus the override when asked) and waits for /health.
 * The stack is removed with its volumes on `down()`, on exit and on SIGINT, SIGTERM or SIGHUP.
 */
export async function up(opts: StackOptions = {}): Promise<Stack> {
  if (running) throw new Error("A stack is already running in this process.");
  const project = opts.project ?? `codex-docs-${process.pid}`;
  const dir = mkdtempSync(join(tmpdir(), "codex-docs-stack-"));
  chmodSync(dir, 0o700);
  const credentialsFile = join(dir, "credentials.json");
  const adminEmail = "admin@example.test";
  const adminPassword = newPassword();
  const postgresPassword = newPassword();
  writeFileSync(credentialsFile, JSON.stringify({ adminEmail, adminPassword }), { mode: 0o600 });

  const files = [composeFile, ...(opts.override ? [join(stackDir, "override.yml")] : [])];
  const composeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.env,
    POSTGRES_PASSWORD: postgresPassword,
    CODEX_ADMIN_EMAIL: adminEmail,
    CODEX_ADMIN_PASSWORD: adminPassword,
    CODEX_DOCS_STACK_DIR: stackDir,
  };
  running = { project, baseUrl: "http://127.0.0.1:8080", credentialsFile, composeEnv, files, dir };
  hookTeardown();

  await run(composeArgs(running, ["up", "-d"]), composeEnv);
  try {
    await waitForHealth(running.baseUrl, opts.healthTimeoutMs ?? 240_000);
  } catch (error) {
    await reportFailure(running);
    down();
    throw error;
  }
  return { project, baseUrl: running.baseUrl, credentialsFile };
}

/** Removes the stack and its volumes, and the credentials file. Safe to call twice. */
export function down(): void {
  const r = running;
  if (!r) return;
  running = undefined;
  spawnSync("docker", composeArgs(r, ["down", "--volumes", "--remove-orphans", "--timeout", "5"]), {
    env: r.composeEnv,
    stdio: "inherit",
  });
  rmSync(r.dir, { recursive: true, force: true });
}

function hookTeardown(): void {
  if (hooked) return;
  hooked = true;
  process.on("exit", () => down());
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]] as const) {
    process.on(signal, () => {
      down();
      process.exit(code);
    });
  }
}

function run(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("docker", args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`docker ${args.slice(0, 4).join(" ")} exited with ${code}`)),
    );
  });
}

async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "no answer";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      last = `status ${response.status}`;
      if (response.ok) return;
    } catch {
      last = "connection refused";
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`/health did not answer 200 within ${timeoutMs / 1000} s (last: ${last}).`);
}

/** Prints service states and the last log lines of the app and the worker, without lines that mention secrets. */
async function reportFailure(r: Running): Promise<void> {
  spawnSync("docker", composeArgs(r, ["ps", "--all", "--format", "table {{.Service}}\t{{.State}}\t{{.Status}}"]), {
    env: r.composeEnv,
    stdio: "inherit",
  });
  for (const service of ["codex", "worker"]) {
    const logs = spawnSync("docker", composeArgs(r, ["logs", "--no-color", "--tail", "40", service]), {
      env: r.composeEnv,
      encoding: "utf8",
    });
    const safe = (logs.stdout ?? "")
      .split("\n")
      .filter((line) => !/password|secret|token|cookie|connection/i.test(line))
      .join("\n");
    console.error(`--- ${service} (last lines, secrets filtered) ---\n${safe}`);
  }
}
