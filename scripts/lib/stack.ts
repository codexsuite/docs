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
  /** True once `snapshot()` has copied the database and the blob volume. */
  snapshotTaken?: boolean;
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
  // The blob copy lives in a volume that compose does not know about.
  if (r.snapshotTaken) spawnSync("docker", ["volume", "rm", "--force", seedBlobVolume(r)], { stdio: "ignore" });
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

// Snapshot and restore. The seed runs once through the REST API. Specs then change data, and a restore puts the
// database and the blob folder back to the moment after the seed, so ids, History and drafts come back as they were.
// The key ring volume (codex-keys) is never touched, because saved AI keys cannot be read without it.

const appDatabase = "codex";
const seedDatabase = "codex_seed";

function seedBlobVolume(r: Pick<Running, "project">): string {
  return `${r.project}_codex-blobs-seed`;
}

function need(): Running {
  if (!running) throw new Error("No stack is running in this process. Start one with up() first.");
  return running;
}

/** Runs docker, throws with the command's first words and the last error lines (secrets filtered) when it fails, and returns stdout. */
function docker(r: Running, args: string[]): string {
  const result = spawnSync("docker", args, { env: r.composeEnv, encoding: "utf8" });
  if (result.status !== 0) {
    const safe = (result.stderr ?? "")
      .split("\n")
      .filter((line) => !/password|secret|token|cookie|connection/i.test(line))
      .slice(-6)
      .join("\n");
    throw new Error(`docker ${args.slice(0, 3).join(" ")} exited with ${result.status}.\n${safe}`);
  }
  return result.stdout ?? "";
}

/** One SQL statement on the maintenance database, through the unix socket inside the container, so no password is needed. */
function sql(r: Running, statement: string): void {
  docker(r, composeArgs(r, ["exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", statement]));
}

/** Copies the blob volume one way or the other, inside a throwaway container built from the postgres image. */
function copyBlobs(r: Running, direction: "save" | "restore"): void {
  const container = docker(r, composeArgs(r, ["ps", "--all", "-q", "postgres"])).trim().split("\n")[0];
  if (!container) throw new Error("The postgres container was not found.");
  const image = docker(r, ["inspect", "--format", "{{.Config.Image}}", container]).trim();
  const live = `${r.project}_codex-blobs`;
  const copy = seedBlobVolume(r);
  if (direction === "save") docker(r, ["volume", "create", copy]);
  const [from, to] = direction === "save" ? ["live", "copy"] : ["copy", "live"];
  // find -delete first, so a file added since the snapshot goes. cp -a keeps owners, modes and times.
  docker(r, [
    "run", "--rm", "--pull", "never",
    "-v", `${live}:/live`, "-v", `${copy}:/copy`,
    "--entrypoint", "sh", image,
    "-c", `find /${to} -mindepth 1 -delete && cp -a /${from}/. /${to}/`,
  ]);
}

async function startApp(r: Running): Promise<void> {
  docker(r, composeArgs(r, ["start", "codex", "worker"]));
  await waitForHealth(r.baseUrl, 120_000);
  const deadline = Date.now() + 60_000;
  for (;;) {
    const state = docker(r, composeArgs(r, ["ps", "--all", "--format", "{{.State}}", "worker"])).trim();
    if (state === "running") return;
    if (Date.now() > deadline) throw new Error(`The worker is ${state || "missing"} after the restore.`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
}

/**
 * Call after the seed. Stops web and worker, copies the database (CREATE DATABASE codex_seed TEMPLATE codex) and the
 * blob volume to a second volume, then starts web and worker again. Needs a stack from `up()` in this process.
 */
export async function snapshot(): Promise<void> {
  const r = need();
  docker(r, composeArgs(r, ["stop", "--timeout", "30", "codex", "worker"]));
  sql(r, `DROP DATABASE IF EXISTS ${seedDatabase} WITH (FORCE)`);
  sql(r, `CREATE DATABASE ${seedDatabase} TEMPLATE ${appDatabase}`);
  copyBlobs(r, "save");
  r.snapshotTaken = true;
  await startApp(r);
}

export interface RestoreOptions {
  /**
   * Stop web and worker before the restore and start them after. Default true.
   * The drop ends every database connection, the user cache in the web process lives 30 s, and the web process listens
   * on a dedicated connection, so a process left running reads stale state or fails its next query. Only a
   * measurement turns this off.
   */
  restartApp?: boolean;
}

/**
 * Puts the database and the blob folder back to the moment of `snapshot()`, with web and worker healthy again.
 * It drops and recreates the database from the copy, empties the blob folder and copies the saved files back.
 * It leaves the key ring volume alone. Sessions made before the snapshot stay valid. Later ones are gone.
 */
export async function restoreSnapshot(opts: RestoreOptions = {}): Promise<void> {
  const r = need();
  if (!r.snapshotTaken) throw new Error("restoreSnapshot() was called before snapshot().");
  const restart = opts.restartApp ?? true;
  const t0 = Date.now();
  if (restart) docker(r, composeArgs(r, ["stop", "--timeout", "30", "codex", "worker"]));
  const t1 = Date.now();
  sql(r, `DROP DATABASE IF EXISTS ${appDatabase} WITH (FORCE)`);
  sql(r, `CREATE DATABASE ${appDatabase} TEMPLATE ${seedDatabase}`);
  const t2 = Date.now();
  copyBlobs(r, "restore");
  const t3 = Date.now();
  if (restart) await startApp(r);
  const seconds = (from: number, to: number) => ((to - from) / 1000).toFixed(1);
  console.log(`Restored the snapshot in ${seconds(t0, Date.now())} s (stop ${seconds(t0, t1)}, database ${seconds(t1, t2)}, blobs ${seconds(t2, t3)}, start ${seconds(t3, Date.now())}).`);
}

/**
 * A digest of every file in the live blob volume: names, sizes and contents. The restore proof compares it before and after.
 * It does not print file names.
 */
export function blobDigest(): string {
  const r = need();
  const container = docker(r, composeArgs(r, ["ps", "--all", "-q", "postgres"])).trim().split("\n")[0];
  const image = docker(r, ["inspect", "--format", "{{.Config.Image}}", container!]).trim();
  const out = docker(r, [
    "run", "--rm", "--pull", "never", "-v", `${r.project}_codex-blobs:/live:ro`, "--entrypoint", "sh", image,
    "-c", "cd /live && find . -type f -exec sha256sum {} + | sort -k2 | sha256sum | cut -d' ' -f1 && find . -type f | wc -l",
  ]);
  return out.trim().replace(/\n/g, " files:");
}
