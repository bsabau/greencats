import { AGE_BANDS, ageBand, monthsInRange, placeInRange, spread, stayDays, type AgeBand, type Precision, type Spread } from "./report-math";

export type PeriodAnimal = {
  id: string;
  name: string;
  species: string;
  sex: string;
  status: string;
  intakeDate: string | null;
  intakePrecision: Precision | null;
  birthDate: string | null;
  deathDate: string | null;
};
export type PeriodPlacement = { animalId: string; kind: string; startDate: string | null; endDate: string | null; open: boolean };
export type PeriodRecord = { animalId: string; date: string | null; precision: Precision | null };

const EVENTS = ["intakes", "adoptions", "deaths", "fosterStarts", "returns", "sterilizations"] as const;
export type PeriodEvent = (typeof EVENTS)[number];
type Counts = Record<PeriodEvent, number>;

export type StayRow = { group: "all" | "species" | "age"; key: string; spread: Spread };
export type PeriodAnimalRow = {
  name: string;
  species: string;
  sex: string;
  status: string;
  intakeDate: string | null;
  intakePrecision: Precision | null;
  adoptedOn: string | null;
  diedOn: string | null;
  returnedOn: string | null;
  daysToAdoption: number | null;
};

export type PeriodSummary = {
  totals: Counts & { inCareAtStart: number; inCareAtEnd: number };
  monthly: ({ month: string } & Counts)[];
  /** Intake or sterilisation dates too vague to say whether they fall in the range. */
  uncertain: number;
  /** Counted in the totals but not in any month, because only the year is known. */
  yearOnly: number;
  /** Left out of the in-care counts because their intake or exit date is unknown. */
  noIntake: number;
  unknownExit: number;
  stays: StayRow[];
  animals: PeriodAnimalRow[];
};

/** Statuses for animals the shelter never took in, so they are outside every count. */
const NOT_TAKEN_IN = new Set(["external", "unknown"]);
/** Statuses for animals that have left care. */
const LEFT_CARE = new Set(["adopted", "adoption_incomplete", "deceased"]);
const ADOPTION_KINDS = new Set(["adoption", "adoption_incomplete"]);
/** A placement of these kinds that ends without a death or an adoption means the animal came back. */
const RETURNABLE_KINDS = new Set(["adoption", "adoption_incomplete", "foster_adoption"]);
const FOSTER_KINDS = new Set(["foster", "foster_adoption"]);
const FAR_FUTURE = "9999-12-31";

const inRange = (date: string | null, from: string, to: string): date is string => !!date && date >= from && date <= to;

/**
 * The shelter's activity between two dates, worked out from what the database keeps:
 * intake and death dates on the animal, and placements with their start and end.
 * There is no status history, so "in care on a day" is rebuilt from those dates.
 */
export function summarizePeriod(
  animalsIn: PeriodAnimal[],
  placements: PeriodPlacement[],
  sterilizations: PeriodRecord[],
  from: string,
  to: string,
): PeriodSummary {
  const animals = animalsIn.filter((a) => !NOT_TAKEN_IN.has(a.status));
  const byAnimal = new Map(animals.map((a) => [a.id, a]));
  const placementsOf = new Map<string, PeriodPlacement[]>();
  for (const p of placements) if (byAnimal.has(p.animalId)) placementsOf.set(p.animalId, [...(placementsOf.get(p.animalId) ?? []), p]);

  const months = monthsInRange(from, to);
  const monthly = new Map(months.map((m) => [m, Object.fromEntries(EVENTS.map((e) => [e, 0])) as Counts]));
  const totals = Object.fromEntries(EVENTS.map((e) => [e, 0])) as Counts;
  const add = (event: PeriodEvent, date: string, precision: Precision | null = "day") => {
    totals[event]++;
    if (precision !== "year") monthly.get(date.slice(0, 7))![event]++;
  };
  let uncertain = 0;
  let yearOnly = 0;
  const countFuzzy = (event: PeriodEvent, date: string | null, precision: Precision | null) => {
    const place = placeInRange(date, precision, from, to);
    if (place === "uncertain") uncertain++;
    if (place !== "in") return false;
    if (precision === "year") yearOnly++;
    add(event, date!, precision);
    return true;
  };

  const rows = new Map<string, PeriodAnimalRow>();
  const rowFor = (a: PeriodAnimal) => {
    let row = rows.get(a.id);
    if (!row) {
      row = {
        name: a.name, species: a.species, sex: a.sex, status: a.status, intakeDate: a.intakeDate, intakePrecision: a.intakePrecision,
        adoptedOn: null, diedOn: null, returnedOn: null, daysToAdoption: null,
      };
      rows.set(a.id, row);
    }
    return row;
  };

  const stayValues = new Map<string, number[]>();
  const addStay = (key: string, days: number) => stayValues.set(key, [...(stayValues.get(key) ?? []), days]);
  let noIntake = 0;
  let unknownExit = 0;
  let inCareAtStart = 0;
  let inCareAtEnd = 0;

  for (const a of animals) {
    const own = placementsOf.get(a.id) ?? [];
    if (countFuzzy("intakes", a.intakeDate, a.intakePrecision)) rowFor(a);
    if (inRange(a.deathDate, from, to)) {
      add("deaths", a.deathDate);
      rowFor(a).diedOn = a.deathDate;
    }

    // Each animal counts once per month for adoptions, as on the overview, even if moved twice.
    const adoptionMonths = new Set<string>();
    for (const p of own) {
      if (p.kind === "adoption" && inRange(p.startDate, from, to)) {
        const row = rowFor(a);
        if (!row.adoptedOn) {
          row.adoptedOn = p.startDate;
          row.daysToAdoption = stayDays(a.intakeDate, a.intakePrecision, p.startDate);
          if (row.daysToAdoption !== null) {
            addStay("all:all", row.daysToAdoption);
            addStay(`species:${a.species}`, row.daysToAdoption);
            addStay(`age:${ageBand(a.birthDate, a.intakeDate!)}`, row.daysToAdoption);
          }
        }
        if (!adoptionMonths.has(p.startDate.slice(0, 7))) {
          adoptionMonths.add(p.startDate.slice(0, 7));
          add("adoptions", p.startDate);
        }
      }
      if (FOSTER_KINDS.has(p.kind) && inRange(p.startDate, from, to)) add("fosterStarts", p.startDate);
      if (RETURNABLE_KINDS.has(p.kind) && inRange(p.endDate, from, to) && isReturn(a, p, own)) {
        add("returns", p.endDate);
        rowFor(a).returnedOn = p.endDate;
      }
    }

    // In care on a day: taken in by then, not dead, and not with an adopter.
    if (!a.intakeDate) {
      noIntake++;
      continue;
    }
    const away: [string, string][] = own
      .filter((p) => ADOPTION_KINDS.has(p.kind) && p.startDate)
      // A placement the import closed without an end date: if the animal is back in care it says nothing about when.
      .flatMap((p): [string, string][] =>
        p.endDate ? [[p.startDate!, p.endDate]] : p.open || LEFT_CARE.has(a.status) ? [[p.startDate!, FAR_FUTURE]] : [],
      );
    if (a.deathDate) away.push([a.deathDate, FAR_FUTURE]);
    if (away.length === 0 && LEFT_CARE.has(a.status)) {
      unknownExit++;
      continue;
    }
    const inCareOn = (day: string) => a.intakeDate! <= day && !away.some(([start, end]) => start <= day && day < end);
    if (inCareOn(from)) inCareAtStart++;
    if (inCareOn(to)) inCareAtEnd++;
  }

  for (const r of sterilizations) {
    if (byAnimal.has(r.animalId)) countFuzzy("sterilizations", r.date, r.precision);
  }

  const stays: StayRow[] = [];
  const pushStay = (group: StayRow["group"], key: string) => {
    const s = spread(stayValues.get(`${group}:${key}`) ?? []);
    if (s) stays.push({ group, key, spread: s });
  };
  pushStay("all", "all");
  for (const species of ["cat", "dog"]) pushStay("species", species);
  for (const band of AGE_BANDS) pushStay("age", band satisfies AgeBand);

  return {
    totals: { ...totals, inCareAtStart, inCareAtEnd },
    monthly: months.map((month) => ({ month, ...monthly.get(month)! })),
    uncertain,
    yearOnly,
    noIntake,
    unknownExit,
    stays,
    animals: [...rows.values()].sort((x, y) => x.name.localeCompare(y.name, "ro")),
  };
}

/** An adoption that ended without the animal dying that day or moving straight to another adoption. */
function isReturn(a: PeriodAnimal, p: PeriodPlacement, own: PeriodPlacement[]): boolean {
  if (!p.endDate || a.deathDate === p.endDate) return false;
  return !own.some((other) => other !== p && ADOPTION_KINDS.has(other.kind) && other.startDate === p.endDate);
}
