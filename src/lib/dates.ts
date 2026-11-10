/**
 * Parses the free-form dates the team wrote in the spreadsheet.
 * Anything it cannot read returns null, so the importer can flag it for review
 * rather than guess. Callers keep the original text alongside the parsed value.
 */
export type Precision = "day" | "month" | "year";
export type FuzzyDate = { date: string; precision: Precision };
export type Extracted = FuzzyDate & { rest: string };

const MONTHS: Record<string, number> = {
  ian: 1, ianuarie: 1, jan: 1, january: 1,
  feb: 2, februarie: 2, february: 2,
  mar: 3, martie: 3, march: 3,
  apr: 4, aprilie: 4, april: 4,
  mai: 5, may: 5,
  iun: 6, iunie: 6, jun: 6, june: 6,
  iul: 7, iulie: 7, jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, septembrie: 9, september: 9,
  oct: 10, octombrie: 10, october: 10,
  noi: 11, nov: 11, noiembrie: 11, november: 11,
  dec: 12, decembrie: 12, december: 12,
};
const MONTH_WORD = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const MIN_YEAR = 1995;
const MAX_YEAR = new Date().getUTCFullYear() + 2;

/** Lowercases and removes Romanian diacritics, one character for one, so match indexes stay valid. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ăâáà]/g, "a")
    .replace(/[îïí]/g, "i")
    .replace(/[șş]/g, "s")
    .replace(/[țţ]/g, "t")
    .replace(/[éèê]/g, "e")
    .replace(/[óöô]/g, "o")
    .replace(/[úü]/g, "u");
}

const pad = (n: number) => String(n).padStart(2, "0");

function build(y: number, m: number, d: number, precision: Precision): FuzzyDate | null {
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return null;
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) return null;
  return { date: `${y}-${pad(m)}-${pad(d)}`, precision };
}

/** The spreadsheet stores `2026.06` as a number, which turns October (`2026.10`) into `2026.1`. */
export function parseYearMonthNumber(n: number): FuzzyDate | null {
  if (Number.isInteger(n)) return build(n, 1, 1, "year");
  const [year, frac] = String(n).split(".");
  if (frac.length === 1) return frac === "1" ? build(Number(year), 10, 1, "month") : null;
  if (frac.length === 2) return build(Number(year), Number(frac), 1, "month");
  return null;
}

type Rule = { re: RegExp; make: (m: RegExpExecArray) => FuzzyDate | null };
const fullYear = (yy: string) => 2000 + Number(yy);

const RULES: Rule[] = [
  { re: /(?<![\d.])(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/, make: (m) => build(+m[1], +m[2], +m[3], "day") },
  { re: /(?<![\d.])(\d{4})[./](\d{1,2})[./](\d{1,2})(?![\d])/, make: (m) => build(+m[1], +m[2], +m[3], "day") },
  { re: /(?<![\d.])(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?![\d])/, make: (m) => build(+m[3], +m[2], +m[1], "day") },
  { re: /(?<![\d.])(\d{1,2})[./](\d{1,2})[./](\d{2})(?![\d.])/, make: (m) => build(fullYear(m[3]), +m[2], +m[1], "day") },
  {
    re: new RegExp(`(?<![\\d.])(\\d{1,2})\\s*(${MONTH_WORD})\\.?\\s*(\\d{4})(?!\\d)`),
    make: (m) => build(+m[3], MONTHS[m[2]], +m[1], "day"),
  },
  {
    re: new RegExp(`(?<![\\p{L}\\d])(${MONTH_WORD})\\.?\\s*(\\d{4})(?!\\d)`, "u"),
    make: (m) => build(+m[2], MONTHS[m[1]], 1, "month"),
  },
  {
    re: new RegExp(`(?<![\\d.])(\\d{4})\\.?\\s*(${MONTH_WORD})(?![\\p{L}])`, "u"),
    make: (m) => build(+m[1], MONTHS[m[2]], 1, "month"),
  },
  { re: /(?<![\d.])(\d{4})\.(\d{1,2})(?![\d.])/, make: (m) => build(+m[1], +m[2], 1, "month") },
  { re: /(?<![\d.])((?:19|20)\d{2})(?![\d.])/, make: (m) => build(+m[1], 1, 1, "year") },
];

/** Finds the first readable date in `text` and returns it with the remaining words. */
export function extractDate(text: string): Extracted | null {
  const folded = fold(text);
  for (const { re, make } of RULES) {
    const m = re.exec(folded);
    if (!m) continue;
    const parsed = make(m);
    if (!parsed) continue;
    const rest = (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length))
      .replace(/\s+/g, " ")
      .replace(/^[\s\-:;,–]+|[\s\-:;,–]+$/g, "");
    return { ...parsed, rest };
  }
  return null;
}

export type CellValue = string | number | Date | null | undefined;

export function parseCellDate(value: CellValue): FuzzyDate | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return { date: value.toISOString().slice(0, 10), precision: "day" };
  if (typeof value === "number") return parseYearMonthNumber(value);
  return extractDate(value);
}

/** Splits a cell holding several dated entries. Commas only split when every part starts with a date. */
export function splitEntries(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.flatMap((line) => {
    const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
    return parts.length > 1 && parts.every((p) => /^\d/.test(p)) ? parts : [line];
  });
}

/** Reads day-and-month values such as `06.07 (luni II)`, `27sep`, or the number `30.06`. */
export function parseDayMonth(value: CellValue, year: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = typeof value === "number" ? value.toFixed(2) : fold(value);
  const full = extractDate(text);
  if (full && full.precision === "day") return full.date;
  const numeric = /(?<![\d.])(\d{1,2})\.(\d{1,2})(?![\d.])/.exec(text);
  if (numeric) return build(year, +numeric[2], +numeric[1], "day")?.date ?? null;
  const words = [...text.matchAll(new RegExp(`(\\d{1,2})\\s*(${MONTH_WORD})(?!\\p{L})`, "gu"))];
  const last = words.at(-1);
  return last ? (build(year, MONTHS[last[2]], +last[1], "day")?.date ?? null) : null;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** Whole months between a birth date and today, or null if there's no usable date. */
export function ageInMonths(birthIso: string | null, today: string): number | null {
  if (!birthIso || birthIso > today) return null;
  const [by, bm, bd] = birthIso.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
}

export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(now);
}
