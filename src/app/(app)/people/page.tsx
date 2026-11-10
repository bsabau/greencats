import Link from "next/link";
import { and, asc, eq, ilike, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { Badge, Card, Empty, Page, Table, Td, Th, btn, btnGhost, inputCls, linkCls } from "@/components/ui";
import { db, schema as s } from "@/db";
import { getI18n, type Key } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { can, maskContact } from "@/lib/permissions";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; foster?: string }> }) {
  const user = await requireUser();
  const { t } = await getI18n();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const full = can(user, "contacts:view_full");
  const filters: SQL[] = [isNull(s.people.erasedAt)];
  if (q) filters.push(ilike(s.people.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`));
  // Filtering by rating would reveal the rating, so it is for those who may see it.
  if (params.foster && full) filters.push(inArray(s.people.fosterRating, ["ok", "conditional"]));
  const rows = (await db
    .select()
    .from(s.people)
    .where(and(...filters))
    .orderBy(asc(s.people.name))).map((p) => maskContact(user, p));
  const counts = await db
    .select({ personId: s.placements.personId, n: sql<number>`count(*)::int` })
    .from(s.placements)
    .where(eq(s.placements.open, true))
    .groupBy(s.placements.personId);
  const open = new Map(counts.map((c) => [c.personId, c.n]));
  const tone = { ok: "green", conditional: "amber", not_ok: "red", unrated: "gray" } as const;

  return (
    <Page title={t("people.title")} actions={can(user, "contacts:edit") ? <Link className={btn} href="/people/new">{t("people.new")}</Link> : undefined}>
      <form className="flex flex-wrap items-center gap-2">
        <input className={`${inputCls} max-w-md`} name="q" defaultValue={q} aria-label={t("common.search")} placeholder={t("common.name")} />
        {full && <label className="flex items-center gap-1.5 text-sm text-stone-700"><input type="checkbox" name="foster" value="1" defaultChecked={Boolean(params.foster)} />{t("people.fosterOnly")}</label>}
        <button className={btnGhost}>{t("common.search")}</button>
      </form>
      {!full && <p className="text-sm text-stone-600">{t("people.hidden")}</p>}
      <Card>
        {rows.length === 0 ? <Empty t={t} /> : (
          <Table>
            <thead><tr><Th>{t("common.name")}</Th>{full && <Th>{t("people.phones")}</Th>}{full && <Th>{t("people.rating")}</Th>}<Th right>{t("people.animals")}</Th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <Td><Link className={`${linkCls} font-medium`} href={`/people/${p.id}`}>{p.name}</Link></Td>
                  {full && <Td>{p.phones.length === 0 ? t("common.none") : p.phones.map((ph, i) => <span key={ph}>{i > 0 && ", "}<a className={linkCls} href={`tel:${ph}`}>{ph}</a></span>)}</Td>}
                  {full && <Td><Badge tone={tone[p.fosterRating]}>{t(`rating.${p.fosterRating}` as Key)}</Badge></Td>}
                  <Td right>{open.get(p.id) ?? 0}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Page>
  );
}
