import { BarChart } from "@/components/charts";
import { ExportLinks, FilterBar, ReportTabs } from "@/components/report-filters";
import { Card, Page, Stat, Table, Td, Th } from "@/components/ui";
import { getClinicOptions, getMedicalReport, medicalTables } from "@/domain/report-medical";
import { getI18n, type Key } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { parseReportFilters } from "@/lib/report-filters";
import { ACTIVITY_GROUPS, type NamedCounts } from "@/lib/report-medical";

const PATH = "/reports/medical";
const GROUPS = Object.entries(ACTIVITY_GROUPS) as [keyof typeof ACTIVITY_GROUPS, readonly string[]][];
const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

export default async function MedicalReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const { t, fmtDate, fmtMonth, fmtMonthShort } = await getI18n();
  const filters = parseReportFilters(await searchParams);
  const [s, clinics] = await Promise.all([getMedicalReport(filters), getClinicOptions()]);
  const monthLabel = (ym: string) => fmtMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
  const sum = (counts: object, kinds: readonly string[]) => kinds.reduce((n, k) => n + (Number((counts as Record<string, unknown>)[k]) || 0), 0);
  const groupLabel = (g: string) => t(`rep.med.group.${g}` as Key);
  const notes = [
    s.yearOnly > 0 && t("rep.note.yearOnly", { n: s.yearOnly }),
    s.uncertain > 0 && t("rep.note.uncertain", { n: s.uncertain }),
  ].filter(Boolean) as string[];

  const namedTable = (rows: NamedCounts[], nameHeader: string, none: string) =>
    rows.length === 0 ? (
      <p className="py-4 text-sm text-stone-500">{t("common.empty")}</p>
    ) : (
      <Table>
        <thead><tr><Th>{nameHeader}</Th><Th right>{t("rep.total")}</Th>{GROUPS.map(([g]) => <Th key={g} right>{groupLabel(g)}</Th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name ?? ""}>
              <Td>{r.name ?? <span className="text-stone-500">{none}</span>}</Td>
              <Td right>{r.total}</Td>
              {GROUPS.map(([g, kinds]) => <Td key={g} right>{sum(r.byKind, kinds)}</Td>)}
            </tr>
          ))}
        </tbody>
      </Table>
    );

  return (
    <Page title={t("rep.title")}>
      <ReportTabs active={PATH} t={t} filters={filters} />
      <FilterBar path={PATH} filters={filters} fields={["species", "clinic"]} clinics={clinics} t={t} />

      <Card title={t("rep.period.title", { from: fmtDate(filters.from), to: fmtDate(filters.to) })}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {GROUPS.map(([g, kinds]) => <Stat key={g} label={groupLabel(g)} value={sum(s.totals, kinds)} />)}
          <Stat label={t("kind.treatment")} value={s.totals.treatment} />
          <Stat label={t("kind.visit")} value={s.totals.visit} />
          <Stat label={t("rep.med.animals")} value={s.animals} />
        </div>
        {notes.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-stone-500">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      </Card>

      <Card title={t("rep.period.monthly")}>
        <BarChart
          series={GROUPS.map(([g], i) => ({ key: g, label: groupLabel(g), color: COLORS[i] }))}
          groups={s.monthly.map((m) => ({
            key: m.month, label: monthLabel(m.month), short: fmtMonthShort(m.month),
            values: Object.fromEntries(GROUPS.map(([g, kinds]) => [g, sum(m, kinds)])),
          }))}
          tableLabel={t("rep.table")}
          groupHeader={t("rep.month")}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("rep.med.tests")}>
          <Table>
            <thead>
              <tr><Th>{t("rep.kind")}</Th><Th right>{t("rep.total")}</Th><Th right>{t("rep.med.positive")}</Th><Th right>{t("rep.med.negative")}</Th><Th right>{t("rep.med.positiveRate")}</Th></tr>
            </thead>
            <tbody>
              {s.tests.map((r) => (
                <tr key={r.kind}>
                  <Td>{t(`kind.${r.kind}` as Key)}</Td><Td right>{r.total}</Td><Td right>{r.positive}</Td><Td right>{r.negative}</Td>
                  <Td right>{r.positiveRate === null ? t("common.none") : `${Math.round(r.positiveRate * 100)}%`}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-stone-500">{t("rep.med.rateHelp")}</p>
        </Card>
        <Card title={t("rep.med.sterilizationsBySex")}>
          <Table>
            <tbody>
              <tr><Td>{t("animals.female")}</Td><Td right>{s.sterilizationsBySex.f}</Td></tr>
              <tr><Td>{t("animals.male")}</Td><Td right>{s.sterilizationsBySex.m}</Td></tr>
              <tr><Td>{t("common.unknown")}</Td><Td right>{s.sterilizationsBySex.unknown}</Td></tr>
            </tbody>
          </Table>
        </Card>
      </div>

      <Card title={t("rep.med.byClinic")}>{namedTable(s.byClinic, t("rep.clinic"), t("rep.med.noClinic"))}</Card>
      <Card title={t("rep.med.byProduct")}>{namedTable(s.byProduct, t("rep.med.product"), t("rep.med.noProduct"))}</Card>

      <Card title={t("rep.downloads")}>
        <ExportLinks name="medical" filters={filters} tables={medicalTables(s, t)} t={t} />
      </Card>
    </Page>
  );
}
