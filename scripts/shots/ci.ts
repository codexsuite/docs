/**
 * Captures screenshots in hosted CI. Contract 10.
 *
 *   tsx scripts/shots/ci.ts --page <key> [--shot <prefix>] [--ref <branch>] [--out <dir>]
 *   tsx scripts/shots/ci.ts --all [--ref <branch>]
 *   tsx scripts/shots/ci.ts --download <runId> [--out <dir>]
 *
 * --page dispatches capture-shots.yml on the shared branch, waits for the run, downloads the webp files
 * into src/assets/shots/ and prints the run URL. Push your spec first, because the run checks out the branch.
 * --all dispatches one run with a leg for every page that has a spec, prints the run id and URL, and does not wait.
 * --download takes every shots-* artifact of a finished run into src/assets/shots/.
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
  // Success returns stdout alone, so a warning on stderr cannot break the JSON a caller parses.
  return { ok: r.status === 0, out: (r.status === 0 ? (r.stdout ?? "") : `${r.stdout ?? ""}${r.stderr ?? ""}`).trim() };
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

const usage = "Usage: shots:ci --page <key> [--shot <prefix>] [--ref <branch>] [--out <dir>] | --all [--ref <branch>] | --download <runId> [--out <dir>]";

/** Copies every webp under a directory, at any depth, into the output folder. Returns the count. */
function collectWebp(from: string, out: string): number {
  mkdirSync(out, { recursive: true });
  let count = 0;
  for (const entry of readdirSync(from, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith(".webp")) {
      cpSync(join(entry.parentPath, entry.name), join(out, entry.name));
      count++;
    }
  }
  return count;
}

function download(runId: string, out: string, pattern: string): number {
  const tmp = mkdtempSync(join(tmpdir(), "codex-docs-shots-"));
  try {
    const result = gh(["run", "download", runId, "--pattern", pattern, "--dir", tmp]);
    if (!result.ok) fail(`Could not download the shots artifacts: ${result.out.split("\n")[0]}`);
    return collectWebp(tmp, out);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Dispatches the workflow and returns the run id and URL. */
async function dispatch(ref: string, page: string, shot: string | undefined, started: number): Promise<{ runId: string; url: string }> {
  // The run checks out the branch, so your spec must be pushed to it.
  git(["fetch", "--quiet", "origin", ref]);
  if (!git(["merge-base", "--is-ancestor", "HEAD", `origin/${ref}`]).ok) {
    fail(`HEAD is not on origin/${ref}. Push your commits to ${ref} first, because the run checks out the branch.`);
  }
  const tag = randomBytes(4).toString("hex");
  const sent = gh(["workflow", "run", "capture-shots.yml", "--ref", ref, "-f", `page=${page}`, "-f", `shot=${shot ?? ""}`, "-f", `tag=${tag}`]);
  if (!sent.ok) fail(`Could not dispatch capture-shots.yml on ${ref}: ${sent.out.split("\n")[0]}`);

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
  return { runId, url };
}

async function main(): Promise<void> {
  const out = resolve(arg("--out") ?? join(repoRoot, "src/assets/shots"));
  const ref = arg("--ref") ?? sharedBranch;

  const downloadId = arg("--download");
  if (downloadId) {
    if (!/^\d+$/.test(downloadId)) fail(usage);
    const view = gh(["run", "view", downloadId, "--json", "status,conclusion,url"]);
    if (!view.ok) fail(`Could not read run ${downloadId}: ${view.out.split("\n")[0]}`);
    const state = JSON.parse(view.out) as { status: string; conclusion: string; url: string };
    if (state.status !== "completed") fail(`Run ${downloadId} is still ${state.status}: ${state.url}`);
    const count = download(downloadId, out, "shots-*");
    console.log(`Downloaded ${count} file(s) into ${out} from a run that ${state.conclusion}: ${state.url}`);
    if (state.conclusion !== "success") console.error("Some legs failed. The files above come from the legs that passed.");
    return;
  }

  if (process.argv.includes("--all")) {
    const { runId, url } = await dispatch(ref, "all", undefined, Date.now());
    console.log(`Run id: ${runId}`);
    console.log(`Run: ${url}`);
    console.log(`When it finishes, run: pnpm shots:ci --download ${runId}`);
    return;
  }

  const page = arg("--page") ?? fail(usage);
  const shot = arg("--shot");
  const started = Date.now();
  const { runId, url } = await dispatch(ref, page, shot, started);
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

  const count = download(runId, out, `shots-${page}`);
  console.log(`Downloaded ${count} file(s) into ${out}.`);
  console.log(`Done in ${seconds} s. Run: ${url}`);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : "shots:ci failed."));
