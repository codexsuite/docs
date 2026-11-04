import type { ShotSpec } from "../types.ts";
export const shots: ShotSpec[] = [{ name: "start-quickstart-proof", route: "/", steps: async (page) => { await page.getByTestId("library-new-book").waitFor(); } }];
