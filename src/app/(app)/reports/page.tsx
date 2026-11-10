import { Card, Page, Stat, StatusBadge, Table, Td, Th, btnGhost } from "@/components/ui";
import { getDueItems } from "@/domain/due";
import { getReportData } from "@/domain/reports";
import { getI18n, type Key } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { addDays, todayIso } from "@/lib/dates";
import { can } from "@/lib/permissions";

const CHART_HEIGHT = 180;
const Swatch = ({ color }: { color: string }) => <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />;

export default async function ReportsPage() {
  const user = await requireUser();
  const { t, fmtMonth, fmtMonthShort } = await getI18n();
  const [{ byStatus, site, flow, paperwork }, due] = await Promise.all([getReportData(), getDueItems()]);
  const today = todayIso();
  const in30 = addDays(today, 30);
  const kinds = [...new Set(due.filter((d) => d.source === "medical").map((d) => d.kind))].sort();
  const max = Math.max(1, ...flow.flatMap((f) => [f.intakes, f.adoptions]));
  const scale = (n: number) => (n === 0 ? 0 : Math.max(3, (n / max) * CHART_HEIGHT));
  const monthLabel = (ym: string) => fmtMonth(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));

  return (
    <Page title={t("rep.title")}>
      <Card title={t("rep.site")}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label={t("rep.sterilized")} value={site.sterilized} />
          <Stat label={t("rep.adoptions")} value={site.adopted} />
          <Stat label={t("rep.takenIn")} value={site.taken_in} />
        </div>
        <p className="mt-2 text-xs text-stone-500">{t("rep.takenIn")}: {t("rep.takenInHelp")}</p>
      </Card>

      <Card title={t("rep.flow")}>
        <div className="mb-3 flex gap-4 text-sm text-stone-700">
          <span className="flex items-center gap-1.5"><Swatch color="var(--series-1)" />{t("rep.intakes")}</span>
          <span className="flex items-center gap-1.5"><Swatch color="var(--series-2)" />{t("rep.adopted")}</span>
        </div>
        <div className="relative border-b border-stone-300" style={{ height: CHART_HEIGHT }}>
          <span className="absolute left-0 top-0 text-[11px] tabular-nums text-stone-500">{max}</span>
          <div aria-hidden className="absolute inset-x-0 top-0 border-t border-dashed border-stone-200" />
          <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-stone-200" />
          <div className="absolute inset-0 flex items-end pl-6">
            {flow.map((f) => (
              <div key={f.month} className="group relative flex h-full flex-1 items-end justify-center gap-0.5 hover:bg-stone-100" tabIndex={0}>
                <div className="w-1/4 max-w-3.5 rounded-t" style={{ height: scale(f.intakes), background: "var(--series-1)" }} />
                <div className="w-1/4 max-w-3.5 rounded-t" style={{ height: scale(f.adoptions), background: "var(--series-2)" }} />
                <div role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs text-white group-hover:block group-focus:block">
                  <div className="font-medium capitalize">{monthLabel(f.month)}</div>
                  <div>{t("rep.intakes")}: {f.intakes}</div>
                  <div>{t("rep.adopted")}: {f.adoptions}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex pl-6 pt-1">
          {flow.map((f) => <span key={f.month} className="flex-1 text-center text-[11px] capitalize text-stone-500">{fmtMonthShort(f.month)}</span>)}
        </div>
        <p className="mt-2 text-xs text-stone-500">{t("rep.flowNote")}</p>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-stone-700">{t("rep.table")}</summary>
          <Table>
            <thead><tr><Th>{t("rep.month")}</Th><Th right>{t("rep.intakes")}</Th><Th right>{t("rep.adopted")}</Th></tr></thead>
            <tbody>{flow.map((f) => <tr key={f.month}><Td><span className="capitalize">{monthLabel(f.month)}</span></Td><Td right>{f.intakes}</Td><Td right>{f.adoptions}</Td></tr>)}</tbody>
          </Table>
        </details>
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
            <tbody>{byStatus.map((r) => <tr key={r.status}><Td><StatusBadge status={r.status} t={t} /></Td><Td right>{r.n}</Td></tr>)}</tbody>
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
