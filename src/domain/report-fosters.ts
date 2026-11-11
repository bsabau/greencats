import "server-only";
import { pg } from "@/db";
import type { Key, T } from "@/i18n";
import { HIDDEN, can, redactPhones, type Actor } from "@/lib/permissions";
import type { ReportFilters } from "@/lib/report-filters";
import { summarizeFosters, type AdoptionCaseRow, type FosterPlacement, type FosterSummary } from "@/lib/report-fosters";
import type { ReportTable } from "@/lib/xlsx";

/**
 * Fosters and adoption cases for the filters. Adoption cases hold typed names, so their text is
 * hidden for `actor` the same way as on the adoptions page.
 */
export async function getFosterReport(actor: Actor, f: ReportFilters, today: string): Promise<FosterSummary> {
  const species = () => (f.species ? pg`and a.species = ${f.species}` : pg``);
  const [placements, cases] = await Promise.all([
    pg<FosterPlacement[]>`
      select p.animal_id "animalId", a.name "animalName", p.kind::text kind, p.start_date::text "startDate",
             p.end_date::text "endDate", p.open, p.person_id "personId", pe.name "personName",
             pe.erased_at is not null "personErased", pe.foster_rating::text "fosterRating", a.death_date::text "deathDate"
      from placements p
      join animals a on a.id = p.animal_id
      join people pe on pe.id = p.person_id
      where true ${species()}`,
    pg<AdoptionCaseRow[]>`
      select c.animal_name "animalName", c.adopter_name "adopterName", c.stage::text stage,
             to_char(c.created_at at time zone 'Europe/Bucharest', 'YYYY-MM-DD') "openedOn", c.next_step_on::text "nextStepOn"
      from adoption_cases c
      left join animals a on a.id = c.animal_id
      where true ${species()}`,
  ]);
  const shown = cases.map((c) => ({ ...c, animalName: redactPhones(actor, c.animalName), adopterName: redactPhones(actor, c.adopterName) }));
  return summarizeFosters(placements, shown, f.from, f.to, today);
}

/** Who may see what in this report, decided once for the page and the download. */
export function fosterVisibility(actor: Actor) {
  return {
    // Names show on the page as on the people list. Ratings and bulk downloads of names need full contact access.
    rating: can(actor, "contacts:view_full"),
    namesInDownload: can(actor, "contacts:view_full"),
    adopters: can(actor, "adoptions:export"),
  };
}

export function fosterTables(s: FosterSummary, actor: Actor, t: T): ReportTable[] {
  const see = fosterVisibility(actor);
  const person = (name: string, erased: boolean, allowed: boolean) => (erased ? t("people.erased") : allowed ? name : HIDDEN);
  const kind = (k: string) => t(`placement.${k}` as Key);
  const outcome = (o: string) => t(`rep.fos.outcome.${o}` as Key);
  return [
    {
      key: "fosters",
      label: t("rep.fos.active"),
      headers: [t("rep.fos.person"), ...(see.rating ? [t("people.rating")] : []), t("rep.fos.animalCount"), t("rep.fos.animals"), t("rep.fos.since")],
      rows: s.activeFosters.map((f) => [
        person(f.name, f.erased, see.namesInDownload), ...(see.rating ? [t(`rating.${f.rating}` as Key)] : []), f.animals.length, f.animals.join(", "), f.since,
      ]),
    },
    {
      key: "foster_stays",
      label: t("rep.fos.stays"),
      headers: [t("rep.fos.animal"), t("rep.fos.person"), t("rep.kind"), t("rep.fos.start"), t("rep.fos.end"), t("rep.fos.days"), t("rep.fos.outcome")],
      rows: s.stays.map((r) => [r.animal, person(r.person, r.personErased, see.namesInDownload), kind(r.kind), r.start, r.end, r.days, outcome(r.outcome)]),
    },
    {
      key: "adoption_cases",
      label: t("rep.fos.cases"),
      headers: [t("rep.fos.animal"), ...(see.adopters ? [t("rep.fos.adopter")] : []), t("rep.fos.stage"), t("rep.fos.opened"), t("rep.fos.ageDays"), t("rep.fos.nextStep"), t("common.overdue")],
      rows: s.openCases.map((c) => [
        c.animalName, ...(see.adopters ? [c.adopterName] : []), t(`stage.${c.stage}` as Key), c.openedOn, c.ageDays, c.nextStepOn, c.overdue ? t("common.yes") : t("common.no"),
      ]),
    },
    {
      key: "returns",
      label: t("rep.fos.returns"),
      headers: [t("rep.fos.animal"), ...(see.adopters ? [t("rep.fos.adopter")] : []), t("rep.kind"), t("rep.fos.start"), t("rep.fos.end")],
      rows: s.returns.map((r) => [r.animal, ...(see.adopters ? [person(r.person, r.personErased, true)] : []), kind(r.kind), r.start, r.end]),
    },
  ];
}
