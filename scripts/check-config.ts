import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Compares the product README's `## Configuration` table with the configuration page.
 * The table has the columns Variable, Group, What it does, Default. The page has one `##` heading per
 * group and one ### heading per variable, written as the variable name in backticks.
 * Usage: tsx scripts/check-config.ts <product-readme> [page]
 */

export const defaultPage = fileURLToPath(new URL("../src/content/docs/start/configuration.mdx", import.meta.url));

export type VariableGroups = Map<string, string>;

const variableName = /^CODEX_[A-Z0-9_]+$/;

/** Reads variable to group from the README's Configuration table. */
export function readTable(readme: string): VariableGroups {
  const lines = readme.split("\n");
  const start = lines.findIndex((l) => /^##\s+Configuration\s*$/.test(l));
  if (start < 0) throw new Error("The README has no '## Configuration' section");
  const result: VariableGroups = new Map();
  let seenHeader = false;
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells[0] === "Variable") {
      seenHeader = true;
      continue;
    }
    if (!seenHeader || /^-+$/.test(cells[0]!.replace(/:/g, ""))) continue;
    const name = cells[0]!.replace(/`/g, "");
    if (!variableName.test(name)) throw new Error(`README table row has no variable name: ${line.slice(0, 60)}`);
    if (!cells[1]) throw new Error(`README table row for ${name} has no group`);
    if (result.has(name)) throw new Error(`README table lists ${name} twice`);
    result.set(name, cells[1]);
  }
  if (!seenHeader) throw new Error("The README's Configuration section has no table with a Variable column");
  return result;
}

/** Reads variable to group from the page: each ### `CODEX_X` heading belongs to the ## heading above it. */
export function readPage(page: string): { groups: VariableGroups; duplicates: string[] } {
  const groups: VariableGroups = new Map();
  const duplicates: string[] = [];
  let group = "";
  let inFence = false;
  for (const line of page.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      group = h2[1]!;
      continue;
    }
    const h3 = /^###\s+`([^`]+)`\s*$/.exec(line);
    if (!h3) continue;
    const name = h3[1]!;
    if (groups.has(name)) duplicates.push(name);
    groups.set(name, group);
  }
  return { groups, duplicates };
}

/** Returns one message per difference. An empty list means the page and the table agree. */
export function compare(table: VariableGroups, page: string): string[] {
  const { groups, duplicates } = readPage(page);
  const problems: string[] = [];
  for (const [name, group] of table) {
    const onPage = groups.get(name);
    if (onPage === undefined) problems.push(`${name} is in the README table (group ${group}) but not on the page`);
    else if (onPage !== group) problems.push(`${name} is in group "${group}" in the README but under "${onPage}" on the page`);
  }
  for (const [name, group] of groups) {
    if (!table.has(name)) problems.push(`${name} is on the page (under "${group}") but not in the README table`);
  }
  for (const name of duplicates) problems.push(`${name} has more than one heading on the page`);
  const tableGroups = new Set(table.values());
  const pageGroups = new Set([...groups.values()]);
  for (const g of tableGroups) if (!pageGroups.has(g)) problems.push(`Group "${g}" has no heading on the page`);
  for (const g of pageGroups) if (!tableGroups.has(g)) problems.push(`Group "${g}" is on the page but not in the README table`);
  return problems;
}

/** Runs the check on two files and returns the problems. */
export function checkConfig(readmePath: string, pagePath: string = defaultPage): string[] {
  return compare(readTable(readFileSync(readmePath, "utf8")), readFileSync(pagePath, "utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [readmePath, pagePath] = process.argv.slice(2);
  if (!readmePath) {
    console.error("Usage: tsx scripts/check-config.ts <product-readme> [page]");
    process.exit(2);
  }
  let problems: string[];
  try {
    problems = checkConfig(readmePath, pagePath);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }
  if (problems.length) {
    for (const p of problems) console.error(p);
    console.error(`${problems.length} difference(s) between the README table and the configuration page.`);
    process.exit(1);
  }
  console.log("The configuration page matches the README table.");
}
