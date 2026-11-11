import { addDays, addMonths, ageInMonths, daysBetween } from "./dates";

export type Precision = "day" | "month" | "year";

/** The first and last day a date could be, given how precisely it is known. A missing precision counts as a day. */
export function fuzzySpan(date: string, precision: Precision | null): { start: string; end: string } {
  if (precision === "year") return { start: `${date.slice(0, 4)}-01-01`, end: `${date.slice(0, 4)}-12-31` };
  if (precision === "month") {
    const start = `${date.slice(0, 7)}-01`;
    return { start, end: addDays(addMonths(start, 1), -1) };
  }
  return { start: date, end: date };
}

/**
 * Where an approximate date falls against a range: fully inside it, fully outside it,
 * or partly inside, in which case nobody can say whether it belongs to the range.
 */
export function placeInRange(date: string | null, precision: Precision | null, from: string, to: string): "in" | "out" | "uncertain" {
  if (!date) return "out";
  const { start, end } = fuzzySpan(date, precision);
  if (start >= from && end <= to) return "in";
  if (end < from || start > to) return "out";
  return "uncertain";
}

/** Every month from `from` to `to`, as YYYY-MM. */
export function monthsInRange(from: string, to: string): string[] {
  const months: string[] = [];
  for (let m = `${from.slice(0, 7)}-01`; m.slice(0, 7) <= to.slice(0, 7); m = addMonths(m, 1)) months.push(m.slice(0, 7));
  return months;
}

/** A value from sorted numbers at fraction `q` (0 to 1), interpolating between neighbours. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  return sorted[low] + (sorted[high] - sorted[low]) * (pos - low);
}

export type Spread = { n: number; median: number; p25: number; p75: number };

/** Median and quartiles, rounded to whole units. Null when there is nothing to measure. */
export function spread(values: number[]): Spread | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const round = (q: number) => Math.round(quantile(sorted, q));
  return { n: sorted.length, median: round(0.5), p25: round(0.25), p75: round(0.75) };
}

export const AGE_BANDS = ["kitten", "junior", "adult", "senior", "unknown"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** Under 6 months, under 2 years, under 8 years, older. A birth date known only to the year is close enough. */
export function ageBand(birthDate: string | null, on: string): AgeBand {
  const months = ageInMonths(birthDate, on);
  if (months === null) return "unknown";
  if (months < 6) return "kitten";
  if (months < 24) return "junior";
  if (months < 96) return "adult";
  return "senior";
}

/**
 * Days from intake to a later date. An intake known to the month counts from the middle of
 * that month, which is never more than about two weeks off. One known only to the year is too
 * vague to measure and gives null.
 */
export function stayDays(intakeDate: string | null, intakePrecision: Precision | null, until: string): number | null {
  if (!intakeDate || intakePrecision === "year") return null;
  const start = intakePrecision === "month" ? addDays(`${intakeDate.slice(0, 7)}-01`, 14) : intakeDate;
  const days = daysBetween(start, until);
  return days >= 0 ? days : intakePrecision === "month" && until.slice(0, 7) === intakeDate.slice(0, 7) ? 0 : null;
}
