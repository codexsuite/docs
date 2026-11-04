import type { ShotSpec } from "../types.ts";
export const shots: ShotSpec[] = [{ name: "start-overview-proof", route: "/", steps: async (page) => { await page.getByTestId("library-new-book").waitFor(); } }];
