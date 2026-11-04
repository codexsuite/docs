import type { ShotSpec } from "../types.ts";

/** Proves that a throwing step fails the capture and the workflow. Never listed under "all". */
export const shots: ShotSpec[] = [
  {
    name: "_throws-probe",
    route: "/",
    steps: async () => {
      throw new Error("This step throws on purpose.");
    },
  },
];
