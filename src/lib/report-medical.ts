import { monthsInRange, placeInRange, type Precision } from "./report-math";

export type MedicalRow = {
  animalId: string;
  kind: string;
  date: string | null;
  precision: Precision | null;
  result: "positive" | "negative" | null;
  clinic: string | null;
  product: string | null;
  sex: string;
};

/** The care work the report counts. Weights and notes record facts, not work done, so they are left out. */
export const ACTIVITY_KINDS = [
  "sterilization", "vaccine_polyvalent", "vaccine_rabies", "deworm_internal", "deworm_external",
  "test_fiv_felv", "test_corona", "test_giardia", "test_mange", "treatment", "visit",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const TEST_KINDS = ["test_fiv_felv", "test_corona", "test_giardia", "test_mange"] as const;

/** Groups for the chart, so a year of data stays readable. */
export const ACTIVITY_GROUPS = {
  sterilizations: ["sterilization"],
  vaccines: ["vaccine_polyvalent", "vaccine_rabies"],
  deworming: ["deworm_internal", "deworm_external"],
  tests: [...TEST_KINDS],
} as const satisfies Record<string, readonly ActivityKind[]>;

type KindCounts = Record<ActivityKind, number>;
const zero = () => Object.fromEntries(ACTIVITY_KINDS.map((k) => [k, 0])) as KindCounts;
const isActivity = (kind: string): kind is ActivityKind => (ACTIVITY_KINDS as readonly string[]).includes(kind);

export type TestRow = { kind: string; total: number; positive: number; negative: number; noResult: number; positiveRate: number | null };
export type NamedCounts = { name: string | null; total: number; byKind: KindCounts };

export type MedicalSummary = {
  totals: KindCounts;
  animals: number;
  monthly: ({ month: string } & KindCounts)[];
  byClinic: NamedCounts[];
  byProduct: NamedCounts[];
  sterilizationsBySex: { f: number; m: number; unknown: number };
  tests: TestRow[];
  uncertain: number;
  yearOnly: number;
};

/**
 * Medical work done in a range: what, where and with which product. Dates known only to the
 * month or year follow the same rules as the period summary.
 */
export function summarizeMedical(rows: MedicalRow[], from: string, to: string): MedicalSummary {
  const months = monthsInRange(from, to);
  const monthly = new Map(months.map((m) => [m, zero()]));
  const totals = zero();
  const clinics = new Map<string | null, NamedCounts>();
  const products = new Map<string | null, NamedCounts>();
  const animals = new Set<string>();
  const bySex = { f: 0, m: 0, unknown: 0 };
  const tests = new Map<string, TestRow>(TEST_KINDS.map((k) => [k, { kind: k, total: 0, positive: 0, negative: 0, noResult: 0, positiveRate: null }]));
  let uncertain = 0;
  let yearOnly = 0;

  const bump = (map: Map<string | null, NamedCounts>, name: string | null, kind: ActivityKind) => {
    const entry = map.get(name) ?? { name, total: 0, byKind: zero() };
    entry.total++;
    entry.byKind[kind]++;
    map.set(name, entry);
  };

  for (const r of rows) {
    if (!isActivity(r.kind)) continue;
    const place = placeInRange(r.date, r.precision, from, to);
    if (place === "uncertain") uncertain++;
    if (place !== "in") continue;
    if (r.precision === "year") yearOnly++;
    else monthly.get(r.date!.slice(0, 7))![r.kind]++;
    totals[r.kind]++;
    animals.add(r.animalId);
    bump(clinics, r.clinic, r.kind);
    if (r.product) bump(products, r.product, r.kind);
    if (r.kind === "sterilization") bySex[r.sex === "f" || r.sex === "m" ? r.sex : "unknown"]++;
    const test = tests.get(r.kind);
    if (test) {
      test.total++;
      if (r.result === "positive") test.positive++;
      else if (r.result === "negative") test.negative++;
      else test.noResult++;
    }
  }

  for (const test of tests.values()) {
    const known = test.positive + test.negative;
    test.positiveRate = known > 0 ? test.positive / known : null;
  }
  // Busiest first; records with no clinic or product go last.
  const sorted = (map: Map<string | null, NamedCounts>) =>
    [...map.values()].sort((a, b) => (a.name === null ? 1 : b.name === null ? -1 : b.total - a.total || a.name.localeCompare(b.name, "ro")));

  return {
    totals,
    animals: animals.size,
    monthly: months.map((month) => ({ month, ...monthly.get(month)! })),
    byClinic: sorted(clinics),
    byProduct: sorted(products),
    sterilizationsBySex: bySex,
    tests: [...tests.values()],
    uncertain,
    yearOnly,
  };
}
