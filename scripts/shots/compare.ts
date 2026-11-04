import { createHash } from "node:crypto";

/**
 * The comparison behind "same state in both themes". The two captures of a shot run seconds apart against a
 * server that renders dates from its real clock, so the text is masked before it is hashed.
 */

/** Selectors whose text is random on every capture. Contract 4. */
export const alwaysMasked = ['[data-testid="auth-token-secret"]', '[data-testid="auth-one-time-password"]'];

const months = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";

/** The labels DisplayDate prints: "just now", "12m ago", "2h ago", "Yesterday", "30 Sep", "2 Mar 2025", "14:02" and "2026-01-15 14:02 UTC". */
const timePatterns = [
  /\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/g,
  /\bjust now\b/gi,
  /\b\d+\s?(?:s|m|h|d|min|hr)s? ago\b/gi,
  /\bYesterday\b/g,
  new RegExp(`\\b\\d{1,2} (?:${months})(?: \\d{4})?\\b`, "g"),
  /\b\d{1,2}:\d{2}\b/g,
];

/** Returns the text with every volatile part replaced by a fixed marker. `hidden` holds texts to remove, such as time elements and secrets. */
export function maskText(text: string, hidden: string[] = []): string {
  let out = text;
  for (const part of [...hidden].filter((h) => h.trim().length > 0).sort((a, b) => b.length - a.length)) out = out.split(part).join("[masked]");
  for (const pattern of timePatterns) out = out.replace(pattern, "[time]");
  return out.replace(/\s+/g, " ").trim();
}

export function textHash(text: string, hidden: string[] = []): string {
  return createHash("sha256").update(maskText(text, hidden)).digest("hex");
}
