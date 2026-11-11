import "server-only";
import { pg } from "@/db";
import type { Key, T } from "@/i18n";
import type { ReportFilters } from "@/lib/report-filters";
import { ACTIVITY_KINDS, summarizeMedical, type MedicalRow, type MedicalSummary, type NamedCounts } from "@/lib/report-medical";
import type { ReportTable } from "@/lib/xlsx";

/** Medical work for the filters. Clinics and products are businesses, so nothing here is personal data. */
export async function getMedicalReport(f: ReportFilters): Promise<MedicalSummary> {
  const rows = await pg<MedicalRow[]>`
    select m.animal_id "animalId", m.kind::text kind, m.date::text "date", m.precision::text "precision",
           m.result::text result, c.name clinic, p.name product, a.sex::text sex
    from medical_records m
    join animals a on a.id = m.animal_id
    left join clinics c on c.id = m.clinic_id
    left join products p on p.id = m.product_id
    where m.date is not null
      and m.date <= ${f.to} and m.date >= ${`${f.from.slice(0, 4)}-01-01`}
      ${f.species ? pg`and a.species = ${f.species}` : pg``}
      ${f.clinic ? pg`and m.clinic_id = ${f.clinic}` : pg``}`;
  return summarizeMedical(rows, f.from, f.to);
}

/** Clinics for the filter, active ones first. */
export async function getClinicOptions(): Promise<{ id: string; name: string }[]> {
  return pg`select id, name from clinics order by active desc, lower(name)`;
}

export function medicalTables(s: MedicalSummary, t: T): ReportTable[] {
  const kind = (k: string) => t(`kind.${k}` as Key);
  const kindHeaders = ACTIVITY_KINDS.map(kind);
  const named = (rows: NamedCounts[], none: string) => rows.map((r) => [r.name ?? none, r.total, ...ACTIVITY_KINDS.map((k) => r.byKind[k])]);
  const percent = (rate: number | null) => (rate === null ? null : Math.round(rate * 1000) / 10);
  return [
    {
      key: "by_month",
      label: t("rep.period.monthly"),
      headers: [t("rep.month"), ...kindHeaders],
      rows: s.monthly.map((m) => [m.month, ...ACTIVITY_KINDS.map((k) => m[k])]),
    },
    {
      key: "by_clinic",
      label: t("rep.med.byClinic"),
      headers: [t("rep.clinic"), t("rep.total"), ...kindHeaders],
      rows: named(s.byClinic, t("rep.med.noClinic")),
    },
    {
      key: "by_product",
      label: t("rep.med.byProduct"),
      headers: [t("rep.med.product"), t("rep.total"), ...kindHeaders],
      rows: named(s.byProduct, t("rep.med.noProduct")),
    },
    {
      key: "tests",
      label: t("rep.med.tests"),
      headers: [t("rep.kind"), t("rep.total"), t("rep.med.positive"), t("rep.med.negative"), t("rep.med.noResult"), t("rep.med.positiveRate")],
      rows: s.tests.map((r) => [kind(r.kind), r.total, r.positive, r.negative, r.noResult, percent(r.positiveRate)]),
    },
  ];
}
