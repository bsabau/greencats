import { addDays } from "./dates";
import { monthsInRange, stayDays, type Precision } from "./report-math";

export type ShiftRow = { id: string; title: string; startOn: string; startTime: string | null; capacity: number | null; signups: number };
export type MonthShifts = { month: string; shifts: number; places: number; filled: number; signups: number; empty: number };
export type ShiftSummary = {
  monthly: MonthShifts[];
  totals: Omit<MonthShifts, "month">;
  /** Share of the places on shifts with a set number of volunteers that were taken, from 0 to 1. */
  fillRate: number | null;
  /** Shifts in the next weeks that still need people. */
  open: (ShiftRow & { missing: number | null })[];
};

/** Days ahead the "still needs people" list looks. */
export const UPCOMING_DAYS = 30;

/** Share of shift places taken. Null when no shift had a set capacity. */
export function fillRate(filled: number, places: number): number | null {
  return places > 0 ? filled / places : null;
}

/**
 * Shift coverage: how many shifts there were, how many of their places were taken, and which
 * shifts coming up still need people. Sign-ups beyond the capacity don't count towards it.
 */
export function summarizeShifts(shifts: ShiftRow[], from: string, to: string, today: string): ShiftSummary {
  const months = monthsInRange(from, to);
  const monthly = new Map(months.map((m) => [m, { month: m, shifts: 0, places: 0, filled: 0, signups: 0, empty: 0 }]));
  for (const s of shifts) {
    if (s.startOn < from || s.startOn > to) continue;
    const m = monthly.get(s.startOn.slice(0, 7))!;
    m.shifts++;
    m.signups += s.signups;
    if (s.signups === 0) m.empty++;
    if (s.capacity && s.capacity > 0) {
      m.places += s.capacity;
      m.filled += Math.min(s.signups, s.capacity);
    }
  }
  const rows = [...monthly.values()];
  const totals = rows.reduce(
    (t, m) => ({ shifts: t.shifts + m.shifts, places: t.places + m.places, filled: t.filled + m.filled, signups: t.signups + m.signups, empty: t.empty + m.empty }),
    { shifts: 0, places: 0, filled: 0, signups: 0, empty: 0 },
  );
  const until = addDays(today, UPCOMING_DAYS);
  const open = shifts
    .filter((s) => s.startOn >= today && s.startOn <= until && (s.capacity ? s.signups < s.capacity : s.signups === 0))
    .map((s) => ({ ...s, missing: s.capacity ? s.capacity - s.signups : null }))
    .sort((a, b) => a.startOn.localeCompare(b.startOn) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  return { monthly: rows, totals, fillRate: fillRate(totals.filled, totals.places), open };
}

export type CareAnimal = {
  id: string;
  name: string;
  status: string;
  location: string | null;
  intakeDate: string | null;
  intakePrecision: Precision | null;
  photos: number;
  lastMedical: string | null;
};
export type LongStay = CareAnimal & { days: number | null };

/**
 * Animals in care, longest first. An intake known only to the year can't give a day count, so those
 * animals sort by year after the ones that can be measured; animals with no intake date come last.
 */
export function longStays(animals: CareAnimal[], today: string): { rows: LongStay[]; unknown: number } {
  const rows = animals.map((a) => ({ ...a, days: stayDays(a.intakeDate, a.intakePrecision, today) }));
  const rank = (r: LongStay) => (r.days !== null ? 0 : r.intakeDate ? 1 : 2);
  rows.sort((a, b) => rank(a) - rank(b) || (b.days ?? 0) - (a.days ?? 0) || (a.intakeDate ?? "").localeCompare(b.intakeDate ?? "") || a.name.localeCompare(b.name, "ro"));
  return { rows, unknown: rows.filter((r) => !r.intakeDate).length };
}
