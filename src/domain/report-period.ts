import "server-only";
import { pg } from "@/db";
import type { Key, T } from "@/i18n";
import type { ReportFilters } from "@/lib/report-filters";
import type { Precision } from "@/lib/report-math";
import { summarizePeriod, type PeriodAnimal, type PeriodPlacement, type PeriodRecord, type PeriodSummary } from "@/lib/report-period";
import type { Cell } from "@/lib/xlsx";

/** The period summary for the filters. Holds no personal data: only animals, dates and counts. */
export async function getPeriodReport(f: ReportFilters): Promise<PeriodSummary> {
  // A new fragment per query: postgres.js fragments are not meant to be shared.
  const where = () => pg`where true ${f.species ? pg`and a.species = ${f.species}` : pg``} ${f.sex ? pg`and a.sex = ${f.sex}` : pg``}`;
  const [animals, placements, sterilizations] = await Promise.all([
    pg<PeriodAnimal[]>`
      select a.id, a.name, a.species::text species, a.sex::text sex, a.status::text status,
             a.intake_date::text "intakeDate", a.intake_precision::text "intakePrecision",
             a.birth_date::text "birthDate", a.death_date::text "deathDate"
      from animals a ${where()}`,
    pg<PeriodPlacement[]>`
      select p.animal_id "animalId", p.kind::text kind, p.start_date::text "startDate", p.end_date::text "endDate", p.open
      from placements p join animals a on a.id = p.animal_id ${where()}`,
    pg<PeriodRecord[]>`
      select m.animal_id "animalId", m.date::text "date", m.precision::text "precision"
      from medical_records m join animals a on a.id = m.animal_id ${where()} and m.kind = 'sterilization'`,
  ]);
  return summarizePeriod(animals, placements, sterilizations, f.from, f.to);
}

export type ReportTable = { key: string; label: string; headers: string[]; rows: Cell[][] };

/** A date as precisely as it is known: 2026-03-15, 2026-03 or 2026. */
const fuzzy = (date: string | null, precision: Precision | null) =>
  !date ? null : precision === "year" ? date.slice(0, 4) : precision === "month" ? date.slice(0, 7) : date;

/** The tables behind the page, with headers and values in the reader's language, for downloads. */
export function periodTables(s: PeriodSummary, t: T): ReportTable[] {
  const species = (v: string) => (v === "cat" || v === "dog" ? t(`animals.${v}`) : v);
  const sex = (v: string) => (v === "f" ? t("animals.female") : v === "m" ? t("animals.male") : t("common.unknown"));
  return [
    {
      key: "monthly",
      label: t("rep.period.monthly"),
      headers: [t("rep.month"), t("rep.intakes"), t("rep.adopted"), t("rep.deaths"), t("rep.fosterStarts"), t("rep.returns"), t("rep.sterilizations")],
      rows: s.monthly.map((m) => [m.month, m.intakes, m.adoptions, m.deaths, m.fosterStarts, m.returns, m.sterilizations]),
    },
    {
      key: "length_of_stay",
      label: t("rep.stay.title"),
      headers: [t("rep.stay.group"), t("rep.stay.n"), t("rep.stay.median"), t("rep.stay.p25"), t("rep.stay.p75")],
      rows: s.stays.map((r) => [stayGroupLabel(r.group, r.key, t), r.spread.n, r.spread.median, r.spread.p25, r.spread.p75]),
    },
    {
      key: "animals",
      label: t("rep.period.animals"),
      headers: [
        t("common.name"), t("animals.species"), t("animals.sex"), t("common.status"), t("animals.intake"),
        t("rep.adoptedOn"), t("rep.returnedOn"), t("rep.diedOn"), t("rep.daysToAdoption"),
      ],
      rows: s.animals.map((a) => [
        a.name, species(a.species), sex(a.sex), t(`status.${a.status}` as Key), fuzzy(a.intakeDate, a.intakePrecision),
        a.adoptedOn, a.returnedOn, a.diedOn, a.daysToAdoption,
      ]),
    },
  ];
}

export function stayGroupLabel(group: string, key: string, t: T): string {
  if (group === "all") return t("rep.stay.all");
  if (group === "species") return key === "cat" || key === "dog" ? t(`animals.${key}`) : key;
  return t(`rep.age.${key}` as Key);
}
