import { BarChart } from "@/components/charts";
import { ReportTabs } from "@/components/report-filters";
import { Card, Page, Stat, StatusBadge, Table, Td, Th, btnGhost } from "@/components/ui";
import { getDueItems } from "@/domain/due";
import { getReportData } from "@/domain/reports";
import { getI18n, type Key } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/dates";
import { can } from "@/lib/permissions";

export default async function ReportsPage() {
  const user = await requireUser();
  const { t, fmtMonth, fmtMonthShort } = await getI18n();
  const [{ byStatus, site, flow, paperwork }, due] = await Promise.all([getReportData(), getDueItems(user)]);
  const today = todayIso();
  const in30 = addDays(today, 30);
  const kinds = [...new Set(due.filter((d) => d.source === "medical").map((d) => d.kind))].sort();
  const monthLabel = (ym: string) => fmtMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));

  return (
    <Page title={t("rep.title")}>
      <ReportTabs active="/reports" t={t} />
      <Card title={t("rep.site")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label={t("rep.sterilized")} value={site.sterilized} />
          <Stat label={t("rep.adoptions")} value={site.adopted} />
          <Stat label={t("rep.takenIn")} value={site.taken_in} />
        </div>
        <p className="mt-2 text-xs text-stone-500">{t("rep.takenIn")}: {t("rep.takenInHelp")}</p>
      </Card>

      <Card title={t("rep.flow")}>
        <BarChart
          series={[
            { key: "intakes", label: t("rep.intakes"), color: "var(--series-1)" },
            { key: "adoptions", label: t("rep.adopted"), color: "var(--series-2)" },
          ]}
          groups={flow.map(({ month, ...values }) => ({ key: month, label: monthLabel(month), short: fmtMonthShort(month), values }))}
          tableLabel={t("rep.table")}
          groupHeader={t("rep.month")}
        />
        <p className="mt-2 text-xs text-stone-500">{t("rep.flowNote")}</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("rep.medical")}>
          <Table>
            <thead><tr><Th>{t("rep.kind")}</Th><Th right>{t("rep.overdue")}</Th><Th right>{t("rep.next30")}</Th></tr></thead>
            <tbody>
              {kinds.map((k) => {
                const ofKind = due.filter((d) => d.kind === k);
                return (
                  <tr key={k}>
                    <Td>{t(`kind.${k}` as Key)}</Td>
                    <Td right>{ofKind.filter((d) => d.dueOn < today).length}</Td>
                    <Td right>{ofKind.filter((d) => d.dueOn >= today && d.dueOn <= in30).length}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
        <Card title={t("rep.paperwork")}>
          <Table>
            <tbody>
              <tr><Td>{t("rep.noBook")}</Td><Td right>{paperwork.no_book}</Td></tr>
              <tr><Td>{t("rep.noChip")}</Td><Td right>{paperwork.no_chip}</Td></tr>
              <tr><Td>{t("rep.notSterilized")}</Td><Td right>{paperwork.not_sterilized}</Td></tr>
              <tr><Td>{t("rep.noFiv")}</Td><Td right>{paperwork.no_fiv}</Td></tr>
            </tbody>
          </Table>
        </Card>
        <Card title={t("rep.population")}>
          <Table>
            <tbody>{byStatus.map((r) => <tr key={`${r.status}:${r.location}`}><Td><StatusBadge status={r.status} location={r.location} t={t} /></Td><Td right>{r.n}</Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card title={t("rep.exports")}>
          <div className="flex flex-wrap gap-2">
            <a className={btnGhost} href="/export/animals">{t("rep.exportAnimals")}</a>
            <a className={btnGhost} href="/export/due">{t("rep.exportDue")}</a>
            {can(user, "adoptions:export") && <a className={btnGhost} href="/export/adoptions">{t("rep.exportAdoptions")}</a>}
          </div>
        </Card>
      </div>
    </Page>
  );
}
