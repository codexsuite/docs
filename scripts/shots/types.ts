import type { Page } from "playwright";

/**
 * Shared shapes for the screenshot runner and the demo seed. Contracts 4 and 5.
 * Ids are the strings the REST API returns. Display numbers are "<chapter>.<scene>", such as "1.2".
 */

/** A signed-in admin on a running instance. The runner builds it and never prints it. */
export interface AdminSession {
  /** Origin of the instance, without a trailing slash, such as "http://localhost:8080". */
  baseUrl: string;
  /** Value of the Cookie header for the signed-in admin. Never log it. */
  cookie: string;
  /** Calls the REST API as the admin. `path` is application-relative and starts with "/". */
  api(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<Response>;
}

/** Everything the demo seed creates on an empty database, from docs/running-example.md. */
export interface SeedResult {
  seriesId: string;
  bookIds: {
    /** Salt and Signal, the running example. */
    saltAndSignal: string;
    /** Tide Tables, the second book for series screens. */
    tideTables: string;
  };
  /** Scene ids of Salt and Signal by display number: "1.1", "1.2" and so on. */
  sceneIds: Record<string, string>;
  /** Knowledge base entry ids by name: "Edith Marrow", "Tobias Venn", "Harrowmouth", "Fresnel lens". */
  entryIds: Record<string, string>;
  /** Source ids by title: "The Keeper's Ledger", "Signals at Sea". */
  sourceIds: Record<string, string>;
  /** Use ids (a source quoted in a scene) by a short name chosen by the references module. */
  useIds: Record<string, string>;
  /** The second user, with the view role on Salt and Signal. */
  viewer: { id: string; email: string };
  /** The AI integration used by the fake model. */
  aiIntegrationId: string;
  /** Print template slug, "novel-6x9". */
  templateSlug: string;
}

/** What seed/structure.ts returns: everything in SeedResult except the references. */
export type StructureSeed = Omit<SeedResult, "sourceIds" | "useIds">;

/** What seed/references.ts returns. */
export type ReferencesSeed = Pick<SeedResult, "sourceIds" | "useIds">;

/** The book the references module attaches sources to. */
export interface SeedBook {
  id: string;
  /** Scene ids by display number. */
  sceneIds: Record<string, string>;
  /** Entry ids by name. */
  entryIds: Record<string, string>;
}

export interface ShotClip {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One screenshot. A page's spec file exports `shots: ShotSpec[]`. */
export interface ShotSpec {
  /** Starts with the page key and is unique across all specs, such as "ui-write-focus". */
  name: string;
  /** Application-relative route. */
  route: string | ((ctx: SeedResult) => string);
  /** Gets the screen into the state to capture. Safe to repeat. Wait on locators, never on fixed sleeps. */
  steps?: (page: Page, ctx: SeedResult) => Promise<void>;
  clip?: ShotClip;
}
