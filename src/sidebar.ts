import { groupLabels, pages, type GroupId, type PageEntry } from "./pagemap";

/**
 * Starlight sidebar, built from the page map. Frozen after wave 0.
 * Order: Home, Get started (with the Guides group last), Using the app,
 * Agents and MCP, Working with Codex, Reference.
 */
type Item = { slug: string } | { label: string; items: Item[] };

const inGroup = (g: GroupId): PageEntry[] =>
  pages.filter((p) => p.group === g).sort((a, b) => a.order - b.order);

const links = (g: GroupId): Item[] => inGroup(g).map((p) => ({ slug: p.slug }));

export const sidebar: Item[] = [
  ...links("home"),
  {
    label: groupLabels.start,
    items: [...links("start"), { label: groupLabels.guides, items: links("guides") }],
  },
  { label: groupLabels.ui, items: links("ui") },
  { label: groupLabels.agents, items: links("agents") },
  { label: groupLabels.work, items: links("work") },
  { label: groupLabels.reference, items: links("reference") },
];
