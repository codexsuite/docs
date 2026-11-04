import type { PageCheck } from "../types.ts";

export const stubMarker: PageCheck = {
  name: "stub-marker",
  final: true,
  run({ page, source }) {
    const lines = source.split("\n");
    const at = lines.findIndex((l) => /\{\s*\/\*\s*STUB\s*\*\/\s*\}/.test(l));
    return at === -1
      ? []
      : [{ check: "stub-marker", slug: page.slug, line: at + 1, message: "the {/* STUB */} marker is still in the page" }];
  },
};
