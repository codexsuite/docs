import type { ShotSpec } from "../types.ts";
export const shots: ShotSpec[] = [{ name: "start-requirements-proof", route: "/", steps: async () => { throw new Error("This leg fails on purpose."); } }];
