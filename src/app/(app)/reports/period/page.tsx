import { BarChart } from "@/components/charts";
import { ExportLinks, FilterBar, ReportTabs } from "@/components/report-filters";
import { Card, Page, Stat, Table, Td, Th } from "@/components/ui";
import { getPeriodReport, periodTables, stayGroupLabel } from "@/domain/report-period";
import { getI18n } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { parseReportFilters } from "@/lib/report-filters";

const PATH = "/reports/period";

export default async function PeriodReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const { t, fmtDate, fmtMonth, fmtMonthShort } = await getI18n();
  const filters = parseReportFilters(await searchParams);
  const s = await getPeriodReport(filters);
  const monthLabel = (ym: string) => fmtMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
  const tables = periodTables(s, t);
  const notes = [
    s.yearOnly > 0 && t("rep.note.yearOnly", { n: s.yearOnly }),
    s.uncertain > 0 && t("rep.note.uncertain", { n: s.uncertain }),
    (s.noIntake > 0 || s.unknownExit > 0) && t("rep.note.census", { n: s.noIntake + s.unknownExit }),
  ].filter(Boolean) as string[];

  return (
    <Page title={t("rep.title")}>
      <ReportTabs active={PATH} t={t} filters={filters} />
      <FilterBar path={PATH} filters={filters} fields={["species", "sex"]} t={t} />

      <Card title={t("rep.period.title", { from: fmtDate(filters.from), to: fmtDate(filters.to) })}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("rep.intakes")} value={s.totals.intakes} />
          <Stat label={t("rep.adopted")} value={s.totals.adoptions} />
          <Stat label={t("rep.fosterStarts")} value={s.totals.fosterStarts} />
          <Stat label={t("rep.sterilizations")} value={s.totals.sterilizations} />
          <Stat label={t("rep.returns")} value={s.totals.returns} />
          <Stat label={t("rep.deaths")} value={s.totals.deaths} />
          <Stat label={t("rep.inCareAt", { date: fmtDate(filters.from) })} value={s.totals.inCareAtStart} />
          <Stat label={t("rep.inCareAt", { date: fmtDate(filters.to) })} value={s.totals.inCareAtEnd} />
        </div>
        {notes.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-stone-500">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        )}
      </Card>

      <Card title={t("rep.period.monthly")}>
        <BarChart
          series={[
            { key: "intakes", label: t("rep.intakes"), color: "var(--series-1)" },
            { key: "adoptions", label: t("rep.adopted"), color: "var(--series-2)" },
            { key: "deaths", label: t("rep.deaths"), color: "var(--series-3)" },
          ]}
          groups={s.monthly.map(({ month, ...values }) => ({ key: month, label: monthLabel(month), short: fmtMonthShort(month), values }))}
          tableLabel={t("rep.table")}
          groupHeader={t("rep.month")}
        />
      </Card>

      <Card title={t("rep.stay.title")}>
        <p className="mb-2 text-sm text-stone-600">{t("rep.stay.help")}</p>
        {s.stays.length === 0 ? (
          <p className="py-4 text-sm text-stone-500">{t("common.empty")}</p>
        ) : (
          <Table>
            <thead>
              <tr><Th>{t("rep.stay.group")}</Th><Th right>{t("rep.stay.n")}</Th><Th right>{t("rep.stay.median")}</Th><Th right>{t("rep.stay.p25")}</Th><Th right>{t("rep.stay.p75")}</Th></tr>
            </thead>
            <tbody>
              {s.stays.map((r) => (
                <tr key={`${r.group}:${r.key}`}>
                  <Td><span className={r.group === "all" ? "font-semibold" : r.group === "age" ? "pl-3" : ""}>{stayGroupLabel(r.group, r.key, t)}</span></Td>
                  <Td right>{r.spread.n}</Td><Td right>{r.spread.median}</Td><Td right>{r.spread.p25}</Td><Td right>{r.spread.p75}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title={t("rep.downloads")}>
        <ExportLinks name="period" filters={filters} tables={tables} t={t} />
        <p className="mt-2 text-xs text-stone-500">{t("rep.period.animalsHelp", { n: s.animals.length })}</p>
      </Card>
    </Page>
  );
}
