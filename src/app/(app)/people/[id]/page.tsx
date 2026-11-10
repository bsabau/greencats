import Link from "next/link";
import { ConfirmDelete, SubmitButton } from "@/components/client";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { erasePerson, updatePerson } from "@/app/actions";
import { Badge, Card, Definition, Empty, Flash, Page, btn, btnGhost, linkCls } from "@/components/ui";
import { db, schema as s } from "@/db";
import { getI18n, type Key } from "@/i18n";
import { audit, requireUser } from "@/lib/auth";
import { can, maskContact, redactPhones } from "@/lib/permissions";
import { findMentions } from "@/domain/people";
import { PersonFields } from "../fields";

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { t, fmtDate } = await getI18n();
  const [row] = await db.select().from(s.people).where(eq(s.people.id, id));
  if (!row) notFound();
  const person = maskContact(user, row);
  const placements = await db
    .select({ p: s.placements, animal: s.animals.name })
    .from(s.placements)
    .innerJoin(s.animals, eq(s.animals.id, s.placements.animalId))
    .where(eq(s.placements.personId, id))
    .orderBy(desc(s.placements.open));
  const none = t("common.none");
  const full = can(user, "contacts:view_full");
  const erased = Boolean(row.erasedAt);
  // Each look at someone's contact details is recorded, so misuse can be traced.
  if (full && !erased) await audit(user.id, "person.view", "person", id);
  const mentions = !erased && can(user, "privacy:manage") ? await findMentions(id) : [];

  return (
    <Page title={erased ? t("people.erased") : person.name} actions={full && !erased ? <Badge>{t(`rating.${person.fosterRating}` as Key)}</Badge> : undefined}>
      <Flash params={await searchParams} t={t} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("animals.details")}>
          {erased ? <p className="text-sm text-stone-600">{t("people.erasedHelp", { date: fmtDate(row.erasedAt!.toISOString().slice(0, 10)) })}</p> : full ? (
            <dl className="space-y-3">
              <Definition label={t("people.phones")}>
                {person.phones.length ? person.phones.map((p) => <a key={p} className={`${linkCls} mr-3`} href={`tel:${p}`}>{p}</a>) : none}
              </Definition>
              <Definition label={t("people.email")}>{person.email ?? none}</Definition>
              <Definition label={t("people.address")}>{person.address ?? none}</Definition>
              <Definition label={t("common.notes")}>{person.notes ?? none}</Definition>
              <Definition label={t("people.consent")}>{person.consentNote ?? none}</Definition>
            </dl>
          ) : <p className="text-sm text-stone-600">{t("people.hidden")}</p>}
          {!erased && can(user, "contacts:edit") && (
            <details className="mt-4">
              <summary className={`${btnGhost} list-none`}>{t("common.edit")}</summary>
              <form action={updatePerson.bind(null, id)} className="mt-3 space-y-4">
                <PersonFields t={t} values={person} />
                <SubmitButton>{t("common.save")}</SubmitButton>
              </form>
            </details>
          )}
          {!erased && (can(user, "people:export") || can(user, "privacy:manage")) && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4">
              {can(user, "people:export") && <a className={btnGhost} href={`/export/person/${id}`}>{t("people.export")}</a>}
              {can(user, "privacy:manage") && (
                <form action={erasePerson.bind(null, id, `/people/${id}`)} className="flex items-center gap-2">
                  <ConfirmDelete label={t("people.erase")} confirmLabel={t("common.sure")} />
                  <span className="text-xs text-stone-500">{t("people.eraseHelp")}</span>
                </form>
              )}
            </div>
          )}
        </Card>
        <Card title={t("animals.placements")}>
          {placements.length === 0 ? <Empty t={t} /> : (
            <ul className="divide-y divide-stone-100">
              {placements.map(({ p, animal }) => (
                <li key={p.id} className="py-2 text-sm">
                  <Link className={linkCls} href={`/animals/${p.animalId}`}>{animal}</Link>
                  {p.open && <> <Badge tone="green">{t("animals.current")}</Badge></>}
                  <div className="text-stone-600">{t(`placement.${p.kind}` as Key)} · {p.startDate ? fmtDate(p.startDate) : (redactPhones(user, p.startText) ?? none)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {mentions.length > 0 && (
          <Card title={`${t("people.mentions")} (${mentions.length})`}>
            <p className="mb-3 text-sm text-stone-600">{t("people.mentionsHelp")}</p>
            <ul className="divide-y divide-stone-100">
              {mentions.map((m, i) => (
                <li key={i} className="py-2 text-sm">
                  <span className="mr-2 text-stone-500">{t(`mention.${m.kind}` as Key)}</span>
                  <Link className={linkCls} href={m.href}>{m.label}</Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Page>
  );
}
