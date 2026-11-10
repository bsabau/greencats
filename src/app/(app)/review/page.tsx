import Link from "next/link";
import { asc, eq, isNull } from "drizzle-orm";
import { assignPhoto, resolveIssue } from "@/app/actions";
import { Combobox, SubmitButton } from "@/components/client";
import { Card, Empty, Flash, Page, Table, Td, Th, btnGhost, inputCls, linkCls } from "@/components/ui";
import { db, schema as s } from "@/db";
import { getI18n } from "@/i18n";
import { requirePermission } from "@/lib/auth";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requirePermission("review:manage");
  const { t } = await getI18n();
  const [issues, orphans, animals] = await Promise.all([
    db.select().from(s.importIssues).where(eq(s.importIssues.resolved, false)).orderBy(asc(s.importIssues.sheet), asc(s.importIssues.row)),
    db.select().from(s.photos).where(isNull(s.photos.animalId)),
    db.select({ id: s.animals.id, name: s.animals.name }).from(s.animals).orderBy(asc(s.animals.name)),
  ]);
  return (
    <Page title={t("review.title")}>
      <Flash params={await searchParams} t={t} />
      <p className="text-sm text-stone-600">{t("review.intro")}</p>
      {orphans.length > 0 && (
        <Card title={`${t("review.photos")} (${orphans.length})`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {orphans.map((p) => (
              <form key={p.id} action={assignPhoto.bind(null, p.id)} className="space-y-2">
                <img src={`/photos/${p.id}`} alt={p.importNote ?? ""} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
                <p className="text-xs text-stone-500">{p.importNote}</p>
                <Combobox name="animalId" options={animals} placeholder={t("common.search")} emptyLabel={t("search.none")} inputClass={inputCls} ariaLabel={t("review.assign")} />
                <SubmitButton className={btnGhost}>{t("review.assign")}</SubmitButton>
              </form>
            ))}
          </div>
        </Card>
      )}
      <Card title={`${t("nav.review")} (${issues.length})`}>
        {issues.length === 0 ? <Empty t={t} /> : (
          <Table>
            <thead><tr><Th>{t("review.sheet")}</Th><Th>{t("review.row")}</Th><Th>{t("review.field")}</Th><Th>{t("review.value")}</Th><Th>{t("review.message")}</Th><Th /></tr></thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.id}>
                  <Td>{i.sheet}</Td>
                  <Td>{i.row}</Td>
                  <Td>{i.field}</Td>
                  <Td>{i.animalId ? <Link className={linkCls} href={`/animals/${i.animalId}`}>{i.rawValue?.slice(0, 80)}</Link> : i.rawValue?.slice(0, 80)}</Td>
                  <Td>{i.message}</Td>
                  <Td><form action={resolveIssue.bind(null, i.id)}><button className="cursor-pointer whitespace-nowrap text-xs text-brand-800 underline">{t("review.resolve")}</button></form></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Page>
  );
}
