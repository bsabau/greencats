import Link from "next/link";
import { erasePastRetention, erasePerson } from "@/app/actions";
import { ConfirmDelete } from "@/components/client";
import { Card, Empty, Flash, Page, Table, Td, Th, linkCls } from "@/components/ui";
import { getI18n, type Key } from "@/i18n";
import { requirePermission } from "@/lib/auth";
import { getPeoplePastRetention, retentionDays } from "@/lib/retention";

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requirePermission("privacy:manage");
  const { t, fmtDate } = await getI18n();
  const days = retentionDays();
  const due = await getPeoplePastRetention();
  return (
    <Page title={t("privacy.title")}>
      <Flash params={await searchParams} t={t} />
      <Card title={t("privacy.retention")}>
        <p className="text-sm text-stone-700">{t("privacy.retentionText", { days, years: (days / 365).toFixed(1).replace(/\.0$/, "") })}</p>
        <p className="mt-2 text-sm text-stone-600">{t("privacy.retentionHelp")}</p>
      </Card>
      <Card title={`${t("privacy.due")} (${due.length})`}>
        {due.length === 0 ? <Empty t={t} /> : (
          <>
            <p className="mb-3 text-sm text-stone-600">{t("privacy.dueHelp")}</p>
            <Table>
              <thead><tr><Th>{t("common.name")}</Th><Th>{t("privacy.lastContact")}</Th><Th>{t("privacy.basedOn")}</Th><Th /></tr></thead>
              <tbody>
                {due.map((p) => (
                  <tr key={p.id}>
                    <Td><Link className={`${linkCls} font-medium`} href={`/people/${p.id}`}>{p.name}</Link></Td>
                    <Td>{fmtDate(p.lastActivity)}</Td>
                    <Td>{t(`privacy.reason.${p.reason}` as Key)}</Td>
                    <Td><form action={erasePerson.bind(null, p.id, "/admin/privacy")}><ConfirmDelete label={t("people.erase")} confirmLabel={t("common.sure")} /></form></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <form action={erasePastRetention} className="mt-4 flex items-center gap-2 border-t border-stone-100 pt-4">
              <ConfirmDelete label={t("privacy.eraseAll")} confirmLabel={t("common.sure")} />
              <span className="text-sm text-stone-700">{t("privacy.eraseAll")} ({due.length})</span>
            </form>
          </>
        )}
      </Card>
    </Page>
  );
}
