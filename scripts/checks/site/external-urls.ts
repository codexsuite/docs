/**
 * The pure parts of the external link check. The network part is external-links.check.ts.
 * A link counts as dead only when the server says the page is gone or the host name does not exist.
 * Other statuses (401, 403, 405, 429, 5xx) mean a live server refused or failed an automated request,
 * and connection errors other than a missing host name are often temporary.
 */

/** Result of one request: an HTTP status, or the error code of a failed fetch. */
export type LinkResult = number | { code: string | undefined };

export function isDeadLink(result: LinkResult): boolean {
  if (typeof result === "number") return result === 404 || result === 410;
  return result.code === "ENOTFOUND";
}

/** URLs in link targets and plain prose. Fenced code and inline code hold examples, so they are skipped. */
export function externalUrlsIn(text: string): string[] {
  const urls: string[] = [];
  let fence: string | null = null;
  for (const raw of text.split("\n")) {
    const f = /^\s*(`{3,}|~{3,})/.exec(raw);
    if (fence) {
      if (f && f[1]!.startsWith(fence[0]!) && f[1]!.length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1]!;
      continue;
    }
    const line = raw.replace(/`[^`]*`/g, " ");
    for (const m of line.matchAll(/https?:\/\/[^\s)<>"'\]`}]+/g)) {
      urls.push(m[0].replace(/[.,;:]+$/, "").replace(/#.*$/, ""));
    }
  }
  return urls;
}
