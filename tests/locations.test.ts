import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEED_LOCATIONS } from "../src/lib/catalog-seed";

describe("starting locations", () => {
  // The migration moved existing cats to these rows by name; a fresh import finds them by name too.
  it("have the same names in the import as in the migration", () => {
    const migration = readFileSync(new URL("../drizzle/0003_heavy_guardian.sql", import.meta.url), "utf8");
    for (const name of Object.values(SEED_LOCATIONS)) expect(migration).toContain(`'${name}'`);
  });
});
