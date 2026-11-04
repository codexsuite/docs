import type { ShotSpec } from "../types.ts";

/** The flow page: one shot of the Library, where the flow starts. */
export const shots: ShotSpec[] = [
  {
    name: "work-flow-library",
    route: "/",
    steps: async (page) => {
      await page.getByTestId("library-new-book").waitFor();
      await page.getByTestId("library-stack-group").first().waitFor();
    },
  },
];
