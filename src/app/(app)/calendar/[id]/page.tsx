import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { deleteEvent, signUpForShift, withdrawFromShift } from "@/app/actions";
import { Badge, Card, Definition, Flash, Page, btn, btnDanger, btnGhost, linkCls } from "@/components/ui";
import { db, schema as s } from "@/db";
import { getI18n, type Key } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { can, redactPhones } from "@/lib/permissions";

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { t, fmtDate } = await getI18n();
  const [event] = await db.select().from(s.calendarEvents).where(eq(s.calendarEvents.id, id));
  if (!event) notFound();
  const [signups, animal] = await Promise.all([
    db.select({ id: s.users.id, name: s.users.name }).from(s.shiftSignups).innerJoin(s.users, eq(s.users.id, s.shiftSignups.userId)).where(eq(s.shiftSignups.eventId, id)).orderBy(asc(s.users.name)),
    event.animalId ? db.select({ id: s.animals.id, name: s.animals.name }).from(s.animals).where(eq(s.animals.id, event.animalId)) : Promise.resolve([]),
  ]);
  const mine = signups.some((u) => u.id === user.id);
  const isShift = event.type === "shift";
  const canDelete = event.createdBy === user.id || can(user, "calendar:manage_all");
  const full = event.capacity !== null && signups.length >= event.capacity;

  return (
    <Page title={redactPhones(user, event.title)} actions={<Badge>{t(`event.${event.type}` as Key)}</Badge>}>
      <Flash params={await searchParams} t={t} />
      <Card>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Definition label={t("cal.start")}>{fmtDate(event.startOn)} {event.startTime}</Definition>
          {(event.endOn || event.endTime) && <Definition label={t("cal.end")}>{fmtDate(event.endOn ?? event.startOn)} {event.endTime}</Definition>}
          {animal[0] && <Definition label={t("cal.animal")}><Link className={linkCls} href={`/animals/${animal[0].id}`}>{animal[0].name}</Link></Definition>}
          {event.personId && <Definition label={t("cal.person")}><Link className={linkCls} href={`/people/${event.personId}`}>{t("nav.people")}</Link></Definition>}
        </dl>
        {event.notes && <div className="mt-3"><Definition label={t("common.notes")}>{redactPhones(user, event.notes)}</Definition></div>}
        {canDelete && <form action={deleteEvent.bind(null, id)} className="mt-4"><button className={btnDanger}>{t("common.delete")}</button></form>}
      </Card>
      {isShift && (
        <Card title={`${t("cal.signups")}${event.capacity ? ` (${signups.length}/${event.capacity})` : ""}`}>
          <ul className="mb-3 list-disc pl-5 text-sm text-stone-800">{signups.map((u) => <li key={u.id}>{u.name}</li>)}</ul>
          {mine
            ? <form action={withdrawFromShift.bind(null, id)}><button className={btnGhost}>{t("cal.withdraw")}</button></form>
            : !full && <form action={signUpForShift.bind(null, id)}><button className={btn}>{t("cal.signup")}</button></form>}
        </Card>
      )}
    </Page>
  );
}
