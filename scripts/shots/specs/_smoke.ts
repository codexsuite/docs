import type { ShotSpec } from "../types.ts";

/** Proves the runner: the Library from a published image, in both themes. Page tasks write their own specs. */
export const shots: ShotSpec[] = [
  {
    name: "_smoke-library",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("library-new-book").waitFor();
    },
  },
];
