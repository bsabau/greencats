import Link from "next/link";
import { ExportLinks, FilterBar, ReportTabs } from "@/components/report-filters";
import { Badge, Card, Page, Stat, Table, Td, Th, linkCls } from "@/components/ui";
import { fosterTables, fosterVisibility, getFosterReport } from "@/domain/report-fosters";
import { getI18n, type Key } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { todayIso } from "@/lib/dates";
import { parseReportFilters } from "@/lib/report-filters";
import { OPEN_STAGES } from "@/lib/report-fosters";

const PATH = "/reports/fosters";

export default async function FosterReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const { t, fmtDate } = await getI18n();
  const filters = parseReportFilters(await searchParams);
  const today = todayIso();
  const s = await getFosterReport(user, filters, today);
  const see = fosterVisibility(user);
  const none = t("common.none");
  const days = (n: number | undefined) => n ?? none;
  const empty = <p className="py-4 text-sm text-stone-500">{t("common.empty")}</p>;
  const ended = s.stays.length;

  return (
    <Page title={t("rep.title")}>
      <ReportTabs active={PATH} t={t} filters={filters} />
      <FilterBar path={PATH} filters={filters} fields={["species"]} t={t} />

      <Card title={t("rep.fos.now")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label={t("rep.fos.activePeople")} value={s.activeFosters.length} />
          <Stat label={t("rep.fos.activeAnimals")} value={s.activeAnimals} />
          <Stat label={t("rep.fos.currentMedian")} value={days(s.currentStay?.median)} />
          <Stat label={t("rep.fos.openCases")} value={s.openCases.length} />
          <Stat label={t("rep.fos.overdueCases")} value={s.overdueCases} tone={s.overdueCases > 0 ? "alert" : undefined} />
        </div>
        <p className="mt-2 text-xs text-stone-500">{t("rep.fos.nowHelp")}</p>
      </Card>

      <Card title={t("rep.period.title", { from: fmtDate(filters.from), to: fmtDate(filters.to) })}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label={t("rep.fos.started")} value={s.started} />
          <Stat label={t("rep.fos.ended")} value={ended} />
          <Stat label={t("rep.fos.endedInAdoption")} value={ended > 0 ? `${s.endedInAdoption} (${Math.round((s.endedInAdoption / ended) * 100)}%)` : s.endedInAdoption} />
          <Stat label={t("rep.fos.endedMedian")} value={days(s.endedStay?.median)} />
          <Stat label={t("rep.fos.returns")} value={s.returns.length} />
        </div>
        <p className="mt-2 text-xs text-stone-500">{t("rep.fos.endHelp")}</p>
      </Card>

      <Card title={t("rep.fos.active")}>
        {s.activeFosters.length === 0 ? empty : (
          <Table>
            <thead>
              <tr><Th>{t("rep.fos.person")}</Th>{see.rating && <Th>{t("people.rating")}</Th>}<Th right>{t("rep.fos.animalCount")}</Th><Th>{t("rep.fos.animals")}</Th><Th>{t("rep.fos.since")}</Th></tr>
            </thead>
            <tbody>
              {s.activeFosters.map((f) => (
                <tr key={f.personId}>
                  <Td>{f.erased ? <span className="text-stone-500">{t("people.erased")}</span> : <Link className={linkCls} href={`/people/${f.personId}`}>{f.name}</Link>}</Td>
                  {see.rating && <Td>{t(`rating.${f.rating}` as Key)}</Td>}
                  <Td right>{f.animals.length}</Td>
                  <Td>{f.animals.join(", ")}</Td>
                  <Td>{f.since ? fmtDate(f.since) : none}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title={t("rep.fos.cases")}>
        <div className="mb-3 flex flex-wrap gap-2">
          {OPEN_STAGES.map((stage) => <Badge key={stage} tone="amber">{t(`stage.${stage}` as Key)}: {s.casesByStage[stage]}</Badge>)}
          {s.caseAge && <Badge>{t("rep.fos.caseMedian", { n: s.caseAge.median })}</Badge>}
        </div>
        {s.openCases.length === 0 ? empty : (
          <Table>
            <thead>
              <tr>
                <Th>{t("rep.fos.animal")}</Th>{see.adopters && <Th>{t("rep.fos.adopter")}</Th>}<Th>{t("rep.fos.stage")}</Th>
                <Th right>{t("rep.fos.ageDays")}</Th><Th>{t("rep.fos.nextStep")}</Th>
              </tr>
            </thead>
            <tbody>
              {s.openCases.map((c, i) => (
                <tr key={i}>
                  <Td>{c.animalName}</Td>
                  {see.adopters && <Td>{c.adopterName ?? none}</Td>}
                  <Td>{t(`stage.${c.stage}` as Key)}</Td>
                  <Td right>{c.ageDays}</Td>
                  <Td>{c.nextStepOn ? <>{fmtDate(c.nextStepOn)} {c.overdue && <Badge tone="red">{t("common.overdue")}</Badge>}</> : none}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title={t("rep.fos.returns")}>
        {s.returns.length === 0 ? empty : (
          <Table>
            <thead><tr><Th>{t("rep.fos.animal")}</Th>{see.adopters && <Th>{t("rep.fos.adopter")}</Th>}<Th>{t("rep.kind")}</Th><Th>{t("rep.fos.start")}</Th><Th>{t("rep.fos.end")}</Th></tr></thead>
            <tbody>
              {s.returns.map((r, i) => (
                <tr key={i}>
                  <Td>{r.animal}</Td>
                  {see.adopters && <Td>{r.personErased ? t("people.erased") : r.person}</Td>}
                  <Td>{t(`placement.${r.kind}` as Key)}</Td><Td>{r.start ? fmtDate(r.start) : none}</Td><Td>{fmtDate(r.end)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title={t("rep.downloads")}>
        <ExportLinks name="fosters" filters={filters} tables={fosterTables(s, user, t)} t={t} />
        {!see.namesInDownload && <p className="mt-2 text-xs text-stone-500">{t("rep.fos.namesHidden")}</p>}
      </Card>
    </Page>
  );
}
