/**
 * Products and clinics: loading the starting list, and linking medical records to them.
 * Used by the app, the import and scripts/normalize-medical.ts, so it does not import "server-only".
 */
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema as s } from "../db";
import { SEED_CLINICS, SEED_PRODUCTS } from "./catalog-seed";
import { PRODUCT_KINDS, nextDue, type MedicalKind } from "./medical-schedule";
import { isNoise, matchDescription, normalizeTerm, type Alias } from "./product-match";

export type Tx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Review items written by the linking step carry this sheet name, so a new run can replace them. */
export const ISSUE_SHEET = "Produse și clinici";
const CLINIC_KINDS: readonly MedicalKind[] = [...PRODUCT_KINDS, "sterilization"];
const KIND_LABEL: Record<string, string> = {
  vaccine_polyvalent: "Polivalent",
  vaccine_rabies: "Antirabic",
  deworm_external: "Dep externa",
  deworm_internal: "Dep interna",
  sterilization: "Sterilizare",
};

/** Fills the product and clinic lists from catalog-seed.ts, only when they are empty. */
export async function seedCatalog(tx: Tx) {
  const [{ products }] = await tx.select({ products: count() }).from(s.products);
  if (products === 0) {
    const rows = await tx
      .insert(s.products)
      .values(SEED_PRODUCTS.map((p) => ({ name: p.name, kinds: p.kinds })))
      .returning({ id: s.products.id, name: s.products.name });
    const idOf = new Map(rows.map((r) => [r.name, r.id]));
    const aliases = new Map<string, string>();
    for (const p of SEED_PRODUCTS) for (const a of [p.name, ...p.aliases]) aliases.set(normalizeTerm(a), idOf.get(p.name)!);
    await tx.insert(s.productAliases).values([...aliases].map(([alias, productId]) => ({ alias, productId })));
  }
  const [{ clinics }] = await tx.select({ clinics: count() }).from(s.clinics);
  if (clinics === 0) {
    const rows = await tx.insert(s.clinics).values(SEED_CLINICS.map((c) => ({ name: c.name }))).returning({ id: s.clinics.id, name: s.clinics.name });
    const idOf = new Map(rows.map((r) => [r.name, r.id]));
    const aliases = new Map<string, string>();
    for (const c of SEED_CLINICS) for (const a of [c.name, ...c.aliases]) aliases.set(normalizeTerm(a), idOf.get(c.name)!);
    await tx.insert(s.clinicAliases).values([...aliases].map(([alias, clinicId]) => ({ alias, clinicId })));
  }
}

export type LinkReport = {
  checked: number;
  productsLinked: number;
  clinicsLinked: number;
  descriptionsCleared: number;
  ambiguous: number;
  wrongType: number;
  unrecognised: number;
  unrecognisedTexts: { kind: string; text: string; records: number }[];
};

/**
 * Links medical records to the product and clinic named in their note. Records that
 * already have a product or clinic keep it. With clearDescriptions, a note that was
 * nothing but those names is emptied; the original text is kept in raw_text.
 * Notes naming an unknown product, or a product under the wrong type, go to the Review page.
 */
export async function linkMedicalRecords(tx: Tx, { clearDescriptions }: { clearDescriptions: boolean }): Promise<LinkReport> {
  const [productAliases, clinicAliases, products, records] = await Promise.all([
    tx.select({ term: s.productAliases.alias, id: s.productAliases.productId }).from(s.productAliases),
    tx.select({ term: s.clinicAliases.alias, id: s.clinicAliases.clinicId }).from(s.clinicAliases),
    tx.select({ id: s.products.id, name: s.products.name, kinds: s.products.kinds }).from(s.products),
    tx
      .select({ id: s.medicalRecords.id, animalId: s.medicalRecords.animalId, kind: s.medicalRecords.kind, description: s.medicalRecords.description, productId: s.medicalRecords.productId, clinicId: s.medicalRecords.clinicId })
      .from(s.medicalRecords)
      .where(inArray(s.medicalRecords.kind, [...CLINIC_KINDS])),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const report: LinkReport = { checked: 0, productsLinked: 0, clinicsLinked: 0, descriptionsCleared: 0, ambiguous: 0, wrongType: 0, unrecognised: 0, unrecognisedTexts: [] };
  const updates = new Map<string, { productId: string | null; clinicId: string | null; clear: boolean; ids: string[] }>();
  const unknown = new Map<string, { kind: string; text: string; animalIds: string[] }>();
  const wrong = new Map<string, { kind: string; product: string; text: string; animalIds: string[] }>();

  for (const r of records) {
    if (!r.description) continue;
    report.checked += 1;
    const takesProduct = (PRODUCT_KINDS as readonly string[]).includes(r.kind);
    const m = matchDescription(r.description, takesProduct ? productAliases : [], clinicAliases as Alias[]);
    let productId = r.productId;
    let clinicId = r.clinicId;
    let blocked = m.productIds.length > 1 || m.clinicIds.length > 1;
    if (blocked) report.ambiguous += 1;
    if (!productId && m.productIds.length === 1) {
      const product = productById.get(m.productIds[0])!;
      if (product.kinds.includes(r.kind)) productId = product.id;
      else {
        blocked = true;
        report.wrongType += 1;
        const key = `${r.kind}|${product.id}`;
        const entry = wrong.get(key) ?? { kind: r.kind, product: product.name, text: r.description, animalIds: [] };
        entry.animalIds.push(r.animalId);
        wrong.set(key, entry);
      }
    }
    if (!clinicId && m.clinicIds.length === 1) clinicId = m.clinicIds[0];
    if (m.productIds.length === 0 && m.clinicIds.length === 0 && takesProduct && !r.productId && !isNoise(r.description)) {
      report.unrecognised += 1;
      const key = `${r.kind}|${normalizeTerm(r.description)}`;
      const entry = unknown.get(key) ?? { kind: r.kind, text: r.description, animalIds: [] };
      entry.animalIds.push(r.animalId);
      unknown.set(key, entry);
    }
    const named = [...m.productIds, ...m.clinicIds];
    const clear = clearDescriptions && !blocked && named.length > 0 && m.leftover === ""
      && m.productIds.every((id) => id === productId) && m.clinicIds.every((id) => id === clinicId);
    const newProduct = productId !== r.productId;
    const newClinic = clinicId !== r.clinicId;
    if (!newProduct && !newClinic && !clear) continue;
    if (newProduct) report.productsLinked += 1;
    if (newClinic) report.clinicsLinked += 1;
    if (clear) report.descriptionsCleared += 1;
    const key = `${productId}|${clinicId}|${clear}`;
    const group = updates.get(key) ?? { productId, clinicId, clear, ids: [] };
    group.ids.push(r.id);
    updates.set(key, group);
  }

  for (const g of updates.values()) {
    for (let i = 0; i < g.ids.length; i += 500) {
      await tx
        .update(s.medicalRecords)
        .set({
          productId: sql`coalesce(${s.medicalRecords.productId}, ${g.productId}::uuid)`,
          clinicId: sql`coalesce(${s.medicalRecords.clinicId}, ${g.clinicId}::uuid)`,
          ...(g.clear ? { rawText: sql`coalesce(${s.medicalRecords.rawText}, ${s.medicalRecords.description})`, description: null } : {}),
        })
        .where(inArray(s.medicalRecords.id, g.ids.slice(i, i + 500)));
    }
  }

  // Review items: replace this step's open ones. Ones a person already marked resolved are not raised again.
  await tx.delete(s.importIssues).where(and(eq(s.importIssues.sheet, ISSUE_SHEET), eq(s.importIssues.resolved, false)));
  const resolved = new Set(
    (await tx.select({ field: s.importIssues.field, raw: s.importIssues.rawValue }).from(s.importIssues).where(eq(s.importIssues.sheet, ISSUE_SHEET)))
      .map((i) => `${i.field}|${normalizeTerm(i.raw ?? "")}`),
  );
  const plural = (n: number) => (n === 1 ? "o înregistrare" : `${n} înregistrări`);
  const issues = [
    ...[...unknown.values()].map((u) => ({
      field: KIND_LABEL[u.kind], rawValue: u.text, animalIds: u.animalIds,
      message: `Produs nerecunoscut (${plural(u.animalIds.length)}). Adăugați-l pe pagina Liste, cu această denumire, sau corectați înregistrarea.`,
    })),
    ...[...wrong.values()].map((w) => ({
      field: KIND_LABEL[w.kind], rawValue: w.text, animalIds: w.animalIds,
      message: `${w.product} nu e trecut la acest tip (${plural(w.animalIds.length)}). Corectați tipul înregistrării sau adăugați tipul la produs pe pagina Liste.`,
    })),
  ].filter((i) => !resolved.has(`${i.field}|${normalizeTerm(i.rawValue)}`));
  if (issues.length) {
    await tx.insert(s.importIssues).values(issues.map((i) => ({
      sheet: ISSUE_SHEET, field: i.field, rawValue: i.rawValue, message: i.message,
      animalId: new Set(i.animalIds).size === 1 ? i.animalIds[0] : null,
    })));
  }
  report.unrecognisedTexts = [...unknown.values()].map((u) => ({ kind: u.kind, text: u.text, records: u.animalIds.length })).sort((a, b) => b.records - a.records);
  return report;
}

export type Recalculation = { animal: string; kind: string; date: string; from: string | null; to: string };

/**
 * Recomputes the next due date of each cat's latest dose, where its product has an interval.
 * Older doses don't matter: only the latest of each type drives a reminder.
 */
export async function recalculateDueDates(tx: Tx): Promise<Recalculation[]> {
  const rows = await tx.execute<{ id: string; name: string; kind: MedicalKind; date: string; next_due_on: string | null; birth_date: string | null; birth_precision: string | null; interval_days: number }>(sql`
    select m.id, a.name, m.kind, m.date::text, m.next_due_on::text, a.birth_date::text, a.birth_precision::text, p.interval_days
    from (
      select distinct on (animal_id, kind) * from medical_records
      where kind in ${sql.raw(`(${PRODUCT_KINDS.map((k) => `'${k}'`).join(",")})`)}
      order by animal_id, kind, date desc nulls last, created_at desc
    ) m
    join animals a on a.id = m.animal_id
    join products p on p.id = m.product_id
    where p.interval_days is not null and m.precision = 'day' and m.date is not null`);
  const changes: Recalculation[] = [];
  for (const r of rows) {
    const birth = r.birth_precision === "year" ? null : r.birth_date;
    const to = nextDue(r.kind, r.date, birth, r.interval_days);
    if (!to || to === r.next_due_on) continue;
    await tx.update(s.medicalRecords).set({ nextDueOn: to }).where(eq(s.medicalRecords.id, r.id));
    changes.push({ animal: r.name, kind: r.kind, date: r.date, from: r.next_due_on, to });
  }
  return changes;
}

/** Records without a product, for counting on the Lists page. */
export const unlinkedFilter = and(isNull(s.medicalRecords.productId), inArray(s.medicalRecords.kind, [...PRODUCT_KINDS]));
