/**
 * Captures screenshots in hosted CI. Contract 10.
 *
 *   tsx scripts/shots/ci.ts --page <key> [--shot <prefix>] [--ref <branch>] [--out <dir>]
 *
 * Dispatches capture-shots.yml on the shared branch, waits for the run, downloads the webp files
 * into src/assets/shots/ and prints the run URL. Push your spec first, because the run checks out the branch.
 */
import { randomBytes } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sharedBranch = "feat/cdx-1-docs-site";
const waitLimitMs = 580_000;

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

function gh(args: string[], cwd = repoRoot): { ok: boolean; out: string } {
  const r = spawnSync("gh", args, { cwd, encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

function git(args: string[]): { ok: boolean; out: string } {
  const r = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const page = arg("--page") ?? fail("Usage: shots:ci --page <key> [--shot <prefix>] [--ref <branch>] [--out <dir>]");
  const shot = arg("--shot");
  const ref = arg("--ref") ?? sharedBranch;
  const out = resolve(arg("--out") ?? join(repoRoot, "src/assets/shots"));

  // The run checks out the branch, so your spec must be pushed to it.
  git(["fetch", "--quiet", "origin", ref]);
  if (!git(["merge-base", "--is-ancestor", "HEAD", `origin/${ref}`]).ok) {
    fail(`HEAD is not on origin/${ref}. Push your commits to ${ref} first, because the run checks out the branch.`);
  }

  const tag = randomBytes(4).toString("hex");
  const started = Date.now();
  const dispatch = gh(["workflow", "run", "capture-shots.yml", "--ref", ref, "-f", `page=${page}`, "-f", `shot=${shot ?? ""}`, "-f", `tag=${tag}`]);
  if (!dispatch.ok) fail(`Could not dispatch capture-shots.yml on ${ref}: ${dispatch.out.split("\n")[0]}`);

  // The run name carries the tag, so concurrent dispatches on the branch never get mixed up.
  let runId: string | undefined;
  while (!runId && Date.now() - started < 90_000) {
    await sleep(4000);
    const list = gh(["run", "list", "--workflow", "capture-shots.yml", "--branch", ref, "--event", "workflow_dispatch", "--limit", "20", "--json", "databaseId,displayTitle,url"]);
    if (list.ok) {
      const found = (JSON.parse(list.out) as { databaseId: number; displayTitle: string; url: string }[]).find((r) => r.displayTitle.includes(tag));
      if (found) runId = String(found.databaseId);
    }
  }
  if (!runId) fail("The dispatched run did not appear within 90 s.");
  const url = gh(["run", "view", runId, "--json", "url", "--jq", ".url"]).out;
  console.log(`Run: ${url}`);

  let conclusion = "";
  while (Date.now() - started < waitLimitMs) {
    const view = gh(["run", "view", runId, "--json", "status,conclusion"]);
    if (view.ok) {
      const state = JSON.parse(view.out) as { status: string; conclusion: string };
      if (state.status === "completed") {
        conclusion = state.conclusion;
        break;
      }
    }
    await sleep(8000);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  if (!conclusion) fail(`The run did not finish within ${waitLimitMs / 1000} s: ${url}`);
  if (conclusion !== "success") {
    const logs = gh(["run", "view", runId, "--log-failed"]).out.split("\n").slice(-30).join("\n");
    console.error(`${logs}\nThe run ${conclusion} after ${seconds} s: ${url}`);
    process.exit(1);
  }

  const tmp = mkdtempSync(join(tmpdir(), "codex-docs-shots-"));
  try {
    const download = gh(["run", "download", runId, "--name", "shots", "--dir", tmp]);
    if (!download.ok) fail(`Could not download the shots artifact: ${download.out.split("\n")[0]}`);
    mkdirSync(out, { recursive: true });
    const files = readdirSync(tmp).filter((f) => f.endsWith(".webp"));
    for (const f of files) cpSync(join(tmp, f), join(out, f));
    console.log(`Downloaded ${files.length} file(s) into ${out}.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`Done in ${seconds} s. Run: ${url}`);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : "shots:ci failed."));
