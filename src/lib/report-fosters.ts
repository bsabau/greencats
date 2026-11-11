import { daysBetween } from "./dates";
import { spread, type Spread } from "./report-math";

export type FosterPlacement = {
  animalId: string;
  animalName: string;
  kind: string;
  startDate: string | null;
  endDate: string | null;
  open: boolean;
  personId: string;
  personName: string;
  personErased: boolean;
  fosterRating: string;
  deathDate: string | null;
};
export type AdoptionCaseRow = {
  animalName: string;
  adopterName: string | null;
  stage: string;
  openedOn: string;
  nextStepOn: string | null;
};

export const FOSTER_KINDS = new Set(["foster", "foster_adoption"]);
const ADOPTION_KINDS = new Set(["adoption", "adoption_incomplete"]);
const RETURNABLE_KINDS = new Set(["adoption", "adoption_incomplete", "foster_adoption"]);
export const OPEN_STAGES = ["paperwork", "to_verify", "external"] as const;

export type ActiveFoster = { personId: string; name: string; erased: boolean; rating: string; animals: string[]; since: string | null };
export type FosterStay = { animal: string; person: string; personErased: boolean; kind: string; start: string | null; end: string; days: number | null; outcome: "adopted" | "died" | "other" };
export type ReturnRow = { animal: string; person: string; personErased: boolean; kind: string; start: string | null; end: string };
export type OpenCase = AdoptionCaseRow & { ageDays: number; overdue: boolean };

export type FosterSummary = {
  activeFosters: ActiveFoster[];
  activeAnimals: number;
  /** How long animals now in foster have been there so far. */
  currentStay: Spread | null;
  started: number;
  stays: FosterStay[];
  /** Length of the foster stays that ended in the range. */
  endedStay: Spread | null;
  endedInAdoption: number;
  returns: ReturnRow[];
  casesByStage: Record<(typeof OPEN_STAGES)[number], number>;
  openCases: OpenCase[];
  caseAge: Spread | null;
  overdueCases: number;
};

const inRange = (date: string | null, from: string, to: string): date is string => !!date && date >= from && date <= to;

/**
 * Fosters and adoptions: who fosters now, how foster stays ended in the range, adoptions that
 * came back, and the open adoption cases. Current figures don't depend on the range.
 */
export function summarizeFosters(placements: FosterPlacement[], cases: AdoptionCaseRow[], from: string, to: string, today: string): FosterSummary {
  const byAnimal = new Map<string, FosterPlacement[]>();
  for (const p of placements) byAnimal.set(p.animalId, [...(byAnimal.get(p.animalId) ?? []), p]);

  const active = new Map<string, ActiveFoster>();
  const currentDays: number[] = [];
  const endedDays: number[] = [];
  const stays: FosterStay[] = [];
  const returns: ReturnRow[] = [];
  let started = 0;
  let endedInAdoption = 0;

  for (const p of placements) {
    const own = byAnimal.get(p.animalId)!;
    const nextIsAdoption = !!p.endDate && own.some((o) => o !== p && ADOPTION_KINDS.has(o.kind) && o.startDate === p.endDate);
    if (FOSTER_KINDS.has(p.kind)) {
      if (inRange(p.startDate, from, to)) started++;
      if (p.open) {
        const entry = active.get(p.personId) ?? { personId: p.personId, name: p.personName, erased: p.personErased, rating: p.fosterRating, animals: [], since: null };
        entry.animals.push(p.animalName);
        if (p.startDate && (!entry.since || p.startDate < entry.since)) entry.since = p.startDate;
        active.set(p.personId, entry);
        if (p.startDate) currentDays.push(daysBetween(p.startDate, today));
      }
      if (inRange(p.endDate, from, to)) {
        const days = p.startDate ? daysBetween(p.startDate, p.endDate) : null;
        if (days !== null) endedDays.push(days);
        const outcome = nextIsAdoption ? "adopted" : p.deathDate === p.endDate ? "died" : "other";
        if (outcome === "adopted") endedInAdoption++;
        stays.push({ animal: p.animalName, person: p.personName, personErased: p.personErased, kind: p.kind, start: p.startDate, end: p.endDate, days, outcome });
      }
    }
    // Same rule as the period summary: it ended, and the animal neither died that day nor moved on to an adoption.
    if (RETURNABLE_KINDS.has(p.kind) && inRange(p.endDate, from, to) && p.deathDate !== p.endDate && !nextIsAdoption) {
      returns.push({ animal: p.animalName, person: p.personName, personErased: p.personErased, kind: p.kind, start: p.startDate, end: p.endDate });
    }
  }

  const casesByStage = Object.fromEntries(OPEN_STAGES.map((s) => [s, 0])) as FosterSummary["casesByStage"];
  const openCases: OpenCase[] = [];
  for (const c of cases) {
    if (!(OPEN_STAGES as readonly string[]).includes(c.stage)) continue;
    casesByStage[c.stage as (typeof OPEN_STAGES)[number]]++;
    openCases.push({ ...c, ageDays: Math.max(0, daysBetween(c.openedOn, today)), overdue: !!c.nextStepOn && c.nextStepOn < today });
  }
  openCases.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.ageDays - a.ageDays);

  const activeFosters = [...active.values()].sort((a, b) => b.animals.length - a.animals.length || a.name.localeCompare(b.name, "ro"));
  for (const f of activeFosters) f.animals.sort((a, b) => a.localeCompare(b, "ro"));
  const byEnd = (a: { end: string }, b: { end: string }) => a.end.localeCompare(b.end);

  return {
    activeFosters,
    activeAnimals: activeFosters.reduce((n, f) => n + f.animals.length, 0),
    currentStay: spread(currentDays),
    started,
    stays: stays.sort(byEnd),
    endedStay: spread(endedDays),
    endedInAdoption,
    returns: returns.sort(byEnd),
    casesByStage,
    openCases,
    caseAge: spread(openCases.map((c) => c.ageDays)),
    overdueCases: openCases.filter((c) => c.overdue).length,
  };
}
