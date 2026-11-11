import Link from "next/link";
import { BarChart } from "@/components/charts";
import { ExportLinks, FilterBar, ReportTabs } from "@/components/report-filters";
import { Badge, Card, Page, Stat, StatusBadge, Table, Td, Th, linkCls } from "@/components/ui";
import { getLocationOptions, getShiftReport, shiftTables } from "@/domain/report-shifts";
import { getI18n } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { parseReportFilters } from "@/lib/report-filters";
import { UPCOMING_DAYS } from "@/lib/report-shifts";

const PATH = "/reports/shifts";
/** The page lists the longest stays; the download has every animal in care. */
const SHOWN_STAYS = 30;

export default async function ShiftReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const { t, fmtDate, fmtMonth, fmtMonthShort } = await getI18n();
  const filters = parseReportFilters(await searchParams);
  const today = todayIso();
  const [r, locations] = await Promise.all([getShiftReport(user, filters, today), getLocationOptions()]);
  const { shifts, stays } = r;
  const monthLabel = (ym: string) => fmtMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
  const none = t("common.none");
  const empty = <p className="py-4 text-sm text-stone-500">{t("common.empty")}</p>;

  return (
    <Page title={t("rep.title")}>
      <ReportTabs active={PATH} t={t} filters={filters} />
      <FilterBar path={PATH} filters={filters} fields={["species", "location"]} locations={locations} t={t} />

      <Card title={t("rep.shift.title", { from: fmtDate(filters.from), to: fmtDate(filters.to) })}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label={t("rep.shift.shifts")} value={shifts.totals.shifts} />
          <Stat label={t("rep.shift.places")} value={shifts.totals.places} />
          <Stat label={t("rep.shift.filled")} value={shifts.fillRate === null ? shifts.totals.filled : `${shifts.totals.filled} (${Math.round(shifts.fillRate * 100)}%)`} />
          <Stat label={t("rep.shift.signups")} value={shifts.totals.signups} />
          <Stat label={t("rep.shift.empty")} value={shifts.totals.empty} tone={shifts.totals.empty > 0 ? "alert" : undefined} />
        </div>
        <p className="mt-2 text-xs text-stone-500">{t("rep.shift.help")}</p>
        <div className="mt-4">
          <BarChart
            series={[
              { key: "places", label: t("rep.shift.places"), color: "var(--series-3)" },
              { key: "filled", label: t("rep.shift.filled"), color: "var(--series-1)" },
            ]}
            groups={shifts.monthly.map((m) => ({ key: m.month, label: monthLabel(m.month), short: fmtMonthShort(m.month), values: { places: m.places, filled: m.filled } }))}
            tableLabel={t("rep.table")}
            groupHeader={t("rep.month")}
          />
        </div>
      </Card>

      <Card title={t("rep.shift.open", { n: UPCOMING_DAYS })}>
        {shifts.open.length === 0 ? empty : (
          <Table>
            <thead><tr><Th>{t("common.date")}</Th><Th>{t("cal.eventTitle")}</Th><Th right>{t("cal.signups")}</Th><Th right>{t("rep.shift.missing")}</Th></tr></thead>
            <tbody>
              {shifts.open.map((s) => (
                <tr key={s.id}>
                  <Td>{fmtDate(s.startOn)}{s.startTime ? `, ${s.startTime}` : ""}</Td>
                  <Td><Link className={linkCls} href={`/calendar/${s.id}`}>{s.title}</Link></Td>
                  <Td right>{s.capacity ? `${s.signups} / ${s.capacity}` : s.signups}</Td>
                  <Td right>{s.missing ?? none}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title={t("rep.stays.title")}>
        <p className="mb-2 text-sm text-stone-600">{t("rep.stays.help", { n: SHOWN_STAYS })}</p>
        {stays.rows.length === 0 ? empty : (
          <Table>
            <thead>
              <tr>
                <Th>{t("common.name")}</Th><Th>{t("common.status")}</Th><Th>{t("animals.intake")}</Th><Th right>{t("rep.stays.days")}</Th>
                <Th right>{t("animals.photos")}</Th><Th>{t("rep.stays.lastMedical")}</Th>
              </tr>
            </thead>
            <tbody>
              {stays.rows.slice(0, SHOWN_STAYS).map((a) => (
                <tr key={a.id}>
                  <Td><Link className={`${linkCls} font-medium`} href={`/animals/${a.id}`}>{a.name}</Link></Td>
                  <Td><StatusBadge status={a.status} location={a.location} t={t} /></Td>
                  <Td>{a.intakeDate ? fmtDate(a.intakeDate, a.intakePrecision) : none}</Td>
                  <Td right>{a.days ?? none}</Td>
                  <Td right>{a.photos === 0 ? <Badge tone="amber">0</Badge> : a.photos}</Td>
                  <Td>{a.lastMedical ? fmtDate(a.lastMedical) : none}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {stays.unknown > 0 && <p className="mt-2 text-xs text-stone-500">{t("rep.stays.unknown", { n: stays.unknown })}</p>}
      </Card>

      <Card title={t("rep.downloads")}>
        <ExportLinks name="shifts" filters={filters} tables={shiftTables(r, t)} t={t} />
      </Card>
    </Page>
  );
}
