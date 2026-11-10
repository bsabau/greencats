import "server-only";
import { cookies } from "next/headers";
import { en } from "./en";
import { ro, type Key } from "./ro";

export type { Key };
export type Locale = "ro" | "en";
export type T = (key: Key, vars?: Record<string, string | number>) => string;

export async function getI18n() {
  const locale: Locale = (await cookies()).get("locale")?.value === "en" ? "en" : "ro";
  const dict: Record<Key, string> = locale === "en" ? en : ro;
  const t: T = (key, vars) =>
    Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), dict[key]);
  const intlLocale = locale === "en" ? "en-GB" : "ro-RO";

  const fmtDate = (iso: string | null | undefined, precision: string | null = "day") => {
    if (!iso) return dict["common.none"];
    const d = new Date(`${iso}T00:00:00Z`);
    const options: Intl.DateTimeFormatOptions =
      precision === "year" ? { year: "numeric", timeZone: "UTC" }
      : precision === "month" ? { year: "numeric", month: "short", timeZone: "UTC" }
      : { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" };
    return new Intl.DateTimeFormat(intlLocale, options).format(d);
  };
  const fmtDateTime = (d: Date) =>
    new Intl.DateTimeFormat(intlLocale, { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bucharest" }).format(d);
  const fmtMonth = (year: number, month: number) =>
    new Intl.DateTimeFormat(intlLocale, { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  const fmtMonthShort = (ym: string) =>
    new Intl.DateTimeFormat(intlLocale, { month: "short", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

  /** `~` marks an age worked out from a birth year only. */
  const fmtAge = (months: number | null, precision: string | null) => {
    if (months === null) return null;
    const approx = precision === "year" ? "~" : "";
    if (months < 12) return approx + t(months === 1 ? "age.month" : "age.months", { n: months });
    const years = Math.floor(months / 12);
    return approx + t(years === 1 ? "age.year" : locale === "ro" && years >= 20 ? "age.yearsDe" : "age.years", { n: years });
  };

  return { t, locale, fmtDate, fmtDateTime, fmtMonth, fmtMonthShort, fmtAge };
}
