import { z } from "zod";
import { addDays, addMonths, todayIso } from "./dates";

export const PRESETS = ["this_month", "last_month", "this_year", "last_year", "last_12_months"] as const;
export type Preset = (typeof PRESETS)[number];
export const DEFAULT_PRESET: Preset = "this_year";
/** A longer range adds nothing for a shelter founded in the last decade and only slows the queries. */
export const MAX_RANGE_YEARS = 10;

export type ReportFilters = {
  from: string;
  to: string;
  /** Set when the range came from a preset, so the form can show it as chosen. */
  preset: Preset | null;
  species: "cat" | "dog" | null;
  sex: "f" | "m" | "unknown" | null;
  location: string | null;
  clinic: string | null;
};

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

const isoDate = z.iso.date();
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional()).catch(undefined);
const schema = z.object({
  preset: optional(z.enum(PRESETS)),
  from: optional(isoDate),
  to: optional(isoDate),
  species: optional(z.enum(["cat", "dog"])),
  sex: optional(z.enum(["f", "m", "unknown"])),
  location: optional(z.uuid()),
  clinic: optional(z.uuid()),
});

export function presetRange(preset: Preset, today: string): { from: string; to: string } {
  const year = today.slice(0, 4);
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case "this_month":
      return { from: firstOfMonth, to: today };
    case "last_month":
      return { from: addMonths(firstOfMonth, -1), to: addDays(firstOfMonth, -1) };
    case "this_year":
      return { from: `${year}-01-01`, to: today };
    case "last_year":
      return { from: `${Number(year) - 1}-01-01`, to: `${Number(year) - 1}-12-31` };
    case "last_12_months":
      return { from: addMonths(firstOfMonth, -11), to: today };
  }
}

/**
 * Reads the report filters from a page's search params or an export URL.
 * Anything unreadable falls back to the default, so a hand-edited link never breaks a page.
 * A preset wins over typed dates. A typed range must have both ends.
 */
export function parseReportFilters(params: Params, today: string = todayIso()): ReportFilters {
  const raw: Record<string, string | undefined> = {};
  for (const key of Object.keys(schema.shape)) {
    const value = params instanceof URLSearchParams ? params.get(key) : params[key];
    raw[key] = Array.isArray(value) ? value[0] : (value ?? undefined);
  }
  const p = schema.parse(raw);

  let preset: Preset | null = p.preset ?? null;
  let { from, to } = p.from && p.to && !preset ? { from: p.from, to: p.to } : presetRange(preset ?? DEFAULT_PRESET, today);
  if (!preset && !(p.from && p.to)) preset = DEFAULT_PRESET;
  if (from > to) [from, to] = [to, from];
  const earliest = addMonths(to, -12 * MAX_RANGE_YEARS);
  if (from < earliest) from = earliest;

  return { from, to, preset, species: p.species ?? null, sex: p.sex ?? null, location: p.location ?? null, clinic: p.clinic ?? null };
}

/** The filters as a query string, for export links and tabs that keep the same range. Empty values are left out. */
export function filterQuery(f: ReportFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (f.preset) q.set("preset", f.preset);
  else {
    q.set("from", f.from);
    q.set("to", f.to);
  }
  for (const key of ["species", "sex", "location", "clinic"] as const) {
    const value = f[key];
    if (value) q.set(key, value);
  }
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}
