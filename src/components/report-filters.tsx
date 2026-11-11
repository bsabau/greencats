import Link from "next/link";
import { btn, btnGhost, inputCls } from "@/components/ui";
import type { T } from "@/i18n";
import { PRESETS, filterQuery, type ReportFilters } from "@/lib/report-filters";

export const REPORT_TABS = [
  { href: "/reports", label: "rep.tab.overview" },
  { href: "/reports/period", label: "rep.tab.period" },
  { href: "/reports/medical", label: "rep.tab.medical" },
  { href: "/reports/fosters", label: "rep.tab.fosters" },
] as const;

/** Links between the report pages. The overview has no filters, so its link carries none. */
export function ReportTabs({ active, t, filters }: { active: string; t: T; filters?: ReportFilters }) {
  return (
    <nav aria-label={t("rep.title")} className="flex flex-wrap gap-1">
      {REPORT_TABS.map((tab) => {
        const current = tab.href === active;
        const href = filters && tab.href !== "/reports" ? `${tab.href}?${filterQuery(filters)}` : tab.href;
        return (
          <Link
            key={tab.href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium ${current ? "bg-brand-700 text-white" : "text-stone-700 hover:bg-stone-100"}`}
          >
            {t(tab.label)}
          </Link>
        );
      })}
    </nav>
  );
}

type Option = { id: string; name: string };
export type FilterField = "species" | "sex" | "location" | "clinic";

/**
 * The filters as a plain GET form, so the chosen view is a link that can be bookmarked or sent.
 * Presets are links. Typed dates are sent with the button.
 */
export function FilterBar({
  path, filters, fields, t, locations = [], clinics = [],
}: { path: string; filters: ReportFilters; fields: FilterField[]; t: T; locations?: Option[]; clinics?: Option[] }) {
  const select = (name: FilterField, label: string, options: { value: string; label: string }[]) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-stone-700">{label}</span>
      <select name={name} defaultValue={filters[name] ?? ""} className={inputCls}>
        <option value="">{t("common.all")}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  return (
    <div className="space-y-3 rounded-2xl border border-stone-200/80 bg-white p-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Link
            key={p}
            href={`${path}?${filterQuery({ ...filters, preset: p })}`}
            aria-current={filters.preset === p ? "true" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${filters.preset === p ? "border-brand-700 bg-brand-50 font-medium text-brand-900" : "border-stone-300 text-stone-700 hover:bg-stone-50"}`}
          >
            {t(`rep.preset.${p}`)}
          </Link>
        ))}
      </div>
      <form method="get" action={path} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">{t("rep.from")}</span>
          <input type="date" name="from" defaultValue={filters.from} required className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">{t("rep.to")}</span>
          <input type="date" name="to" defaultValue={filters.to} required className={inputCls} />
        </label>
        {fields.includes("species") && select("species", t("animals.species"), [{ value: "cat", label: t("animals.cat") }, { value: "dog", label: t("animals.dog") }])}
        {fields.includes("sex") && select("sex", t("animals.sex"), [
          { value: "f", label: t("animals.female") }, { value: "m", label: t("animals.male") }, { value: "unknown", label: t("common.unknown") },
        ])}
        {fields.includes("location") && select("location", t("rep.location"), locations.map((l) => ({ value: l.id, label: l.name })))}
        {fields.includes("clinic") && select("clinic", t("rep.clinic"), clinics.map((c) => ({ value: c.id, label: c.name })))}
        <div className="flex gap-2">
          <button type="submit" className={btn}>{t("rep.apply")}</button>
          <Link href={path} className={btnGhost}>{t("rep.reset")}</Link>
        </div>
      </form>
    </div>
  );
}

/** Download links for a report: the whole workbook, and each table on its own as CSV. */
export function ExportLinks({ name, filters, tables, t }: { name: string; filters: ReportFilters; tables: { key: string; label: string }[]; t: T }) {
  const href = (extra: Record<string, string>) => `/export/report/${name}?${filterQuery(filters, extra)}`;
  return (
    <div className="flex flex-wrap gap-2">
      <a className={btn} href={href({ format: "xlsx" })}>{t("rep.downloadXlsx")}</a>
      {tables.map((tbl) => <a key={tbl.key} className={btnGhost} href={href({ format: "csv", table: tbl.key })}>{t("rep.downloadCsv", { table: tbl.label })}</a>)}
    </div>
  );
}
