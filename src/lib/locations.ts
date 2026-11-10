/**
 * Shelter locations. Used by the app and the import, so it does not import "server-only".
 */
import { sql } from "drizzle-orm";
import { schema as s } from "../db";
import type { Tx } from "./catalog";
import { SEED_LOCATIONS, type SeedLocation } from "./catalog-seed";

export type { SeedLocation };

/** The ids of the starting locations, creating any that are missing. Lists are kept across a re-import. */
export async function ensureLocations(tx: Tx): Promise<Record<SeedLocation, string>> {
  const ids = {} as Record<SeedLocation, string>;
  for (const [key, name] of Object.entries(SEED_LOCATIONS) as [SeedLocation, string][]) {
    const [found] = await tx.select({ id: s.locations.id }).from(s.locations).where(sql`lower(${s.locations.name}) = lower(${name})`);
    ids[key] = found?.id ?? (await tx.insert(s.locations).values({ name }).returning({ id: s.locations.id }))[0].id;
  }
  return ids;
}
