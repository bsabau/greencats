/**
 * Links medical records to products and clinics, and tidies their notes.
 *
 *   npm run normalize-medical                  shows what would change, changes nothing
 *   npm run normalize-medical -- --apply       makes the changes
 *   npm run normalize-medical -- --recalculate also recomputes due dates from product intervals
 *
 * Take a backup first: docker compose run --rm backup once
 */
import { db, pg } from "../src/db";
import { linkMedicalRecords, recalculateDueDates, seedCatalog } from "../src/lib/catalog";

const apply = process.argv.includes("--apply");
const recalculate = process.argv.includes("--recalculate");
class DryRun extends Error {}

let output: unknown;
try {
  await db.transaction(async (tx) => {
    await seedCatalog(tx);
    const link = await linkMedicalRecords(tx, { clearDescriptions: true });
    const changes = recalculate ? await recalculateDueDates(tx) : null;
    output = {
      mode: apply ? "applied" : "dry run, nothing changed (add --apply)",
      ...link,
      unrecognisedTexts: link.unrecognisedTexts.slice(0, 40),
      ...(changes ? { dueDatesChanged: changes.length, dueDateChanges: changes.slice(0, 40) } : {}),
    };
    // The dry run does the real work inside a transaction and then undoes it, so its numbers are exact.
    if (!apply) throw new DryRun();
  });
} catch (e) {
  if (!(e instanceof DryRun)) throw e;
}
console.log(JSON.stringify(output, null, 2));
await pg.end();
