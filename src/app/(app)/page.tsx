import { and, asc, count, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import Link from "next/link";
import { completeDue, undoComplete } from "@/app/actions";
import { DoneButton } from "@/components/client";
import { AnimalPhoto, Badge, Card, Flash, Stat, linkCls } from "@/components/ui";
import { db, schema as s } from "@/db";
import { getAnimalCards, type AnimalCard } from "@/domain/animals";
import { CARE_STATUSES, getDueItems, type DueItem } from "@/domain/due";
import { getI18n, type Key, type T } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { addDays, daysBetween, todayIso } from "@/lib/dates";
import { can, redactPhones } from "@/lib/permissions";

const STALE_DAYS = 60;
const TODO_CAT_LIMIT = 15;

type Group = { animalId: string; name: string; items: DueItem[] };

function groupByAnimal(items: DueItem[]): Group[] {
  const groups = new Map<string, Group>();
  for (const i of items) {
    const key = i.animalId || i.key;
    const g = groups.get(key) ?? { animalId: i.animalId, name: i.animalName, items: [] };
    g.items.push(i);
    groups.set(key, g);
  }
  return [...groups.values()];
}

function DueRow({ group, cards, t, today }: { group: Group; cards: Map<string, AnimalCard>; t: T; today: string }) {
  const card = cards.get(group.animalId);
  return (
    <li className="flex gap-3 py-3">
      <AnimalPhoto photoId={card?.photoId ?? null} name={group.name} className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        {group.animalId ? <Link href={`/animals/${group.animalId}?tab=medical`} className="font-semibold text-stone-900 hover:underline">{group.name}</Link> : <span className="font-semibold text-stone-900">{group.name}</span>}
        {card?.personName && <span className="ml-2 text-xs text-stone-500">{t("animals.fostered", { name: card.personName })}</span>}
        <ul className="mt-1 space-y-1">
          {group.items.map((i) => {
            const delta = daysBetween(today, i.dueOn);
            const label = t(`kind.${i.kind}` as Key);
            return (
              <li key={i.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 text-stone-700">
                  {label}{" "}
                  <span className={`whitespace-nowrap text-xs font-medium ${delta < 0 ? "text-red-700" : "text-stone-500"}`}>
                    {delta < 0 ? t("home.overdueDays", { n: -delta }) : delta === 0 ? t("home.dueToday") : t("home.inDays", { n: delta })}
                  </span>
                </span>
                {i.source === "medical"
                  ? <form action={completeDue.bind(null, i.animalId, i.kind, "/")}><DoneButton label={t("home.done")} ariaLabel={t("home.doneAria", { kind: label, name: group.name })} /></form>
                  : <Link className={`${linkCls} text-xs`} href="/adoptions">{t("nav.adoptions")}</Link>}
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const user = await requireUser();
  const { t, fmtDate } = await getI18n();
  const params = await searchParams;
  const today = todayIso();
  const in14 = addDays(today, 14);
  const [due, cards, [{ inCare }], [{ inFoster }], [{ openAdoptions }], [{ toReview }], myShifts, logistics, openShifts] = await Promise.all([
    getDueItems(),
    getAnimalCards(),
    db.select({ inCare: count() }).from(s.animals).where(inArray(s.animals.status, [...CARE_STATUSES])),
    db.select({ inFoster: count() }).from(s.animals).where(inArray(s.animals.status, ["foster", "foster_adoption"])),
    db.select({ openAdoptions: count() }).from(s.adoptionCases).where(ne(s.adoptionCases.stage, "done")),
    db.select({ toReview: count() }).from(s.importIssues).where(eq(s.importIssues.resolved, false)),
    db
      .select({ id: s.calendarEvents.id, title: s.calendarEvents.title, startOn: s.calendarEvents.startOn, startTime: s.calendarEvents.startTime })
      .from(s.shiftSignups)
      .innerJoin(s.calendarEvents, eq(s.calendarEvents.id, s.shiftSignups.eventId))
      .where(and(eq(s.shiftSignups.userId, user.id), gte(s.calendarEvents.startOn, today)))
      .orderBy(asc(s.calendarEvents.startOn))
      .limit(5),
    db
      .select({ id: s.calendarEvents.id, title: s.calendarEvents.title, startOn: s.calendarEvents.startOn, endOn: s.calendarEvents.endOn })
      .from(s.calendarEvents)
      .where(and(eq(s.calendarEvents.type, "foster_logistics"), or(and(gte(s.calendarEvents.startOn, today), lte(s.calendarEvents.startOn, in14)), and(gte(s.calendarEvents.endOn, today), lte(s.calendarEvents.endOn, in14)))))
      .orderBy(asc(s.calendarEvents.startOn))
      .limit(6),
    db
      .select({
        id: s.calendarEvents.id, title: s.calendarEvents.title, startOn: s.calendarEvents.startOn, capacity: s.calendarEvents.capacity,
        taken: sql<number>`(select count(*)::int from shift_signups ss where ss.event_id = ${s.calendarEvents.id})`,
      })
      .from(s.calendarEvents)
      .where(and(eq(s.calendarEvents.type, "shift"), gte(s.calendarEvents.startOn, today), lte(s.calendarEvents.startOn, in14)))
      .orderBy(asc(s.calendarEvents.startOn))
      .limit(20),
  ]);

  for (const e of [...myShifts, ...logistics, ...openShifts]) e.title = redactPhones(user, e.title);
  const cardMap = new Map(cards.map((c) => [c.id, c]));
  const staleBefore = addDays(today, -STALE_DAYS);
  const week = addDays(today, 7);
  const current = due.filter((d) => d.dueOn >= staleBefore && d.dueOn <= week);
  const stale = due.filter((d) => d.dueOn < staleBefore);
  const overdueCount = due.filter((d) => d.dueOn < today).length;
  const todoGroups = groupByAnimal(current);
  const staleGroups = groupByAnimal(stale);
  const shiftsToFill = openShifts.filter((e) => e.capacity !== null && e.taken < e.capacity).slice(0, 5);
  const firstName = user.name.split(" ")[0];
  const undo = params.done ? (
    <form action={undoComplete.bind(null, params.done, "/")}><button className="cursor-pointer whitespace-nowrap font-semibold underline">{t("common.undo")}</button></form>
  ) : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Flash params={params} t={t} undo={undo} />
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">{t("home.hello", { name: firstName })}</h1>
        <p className="text-sm capitalize text-stone-500">{fmtDate(today)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("dash.inCare")} value={inCare} href="/animals" />
        <Stat label={t("dash.inFoster")} value={inFoster} href="/animals?status=foster" />
        <Stat label={t("dash.overdue")} value={overdueCount} tone={overdueCount ? "alert" : undefined} href="/reports" />
        {can(user, "review:manage")
          ? <Stat label={t("dash.toReview")} value={toReview} href="/review" />
          : <Stat label={t("dash.openAdoptions")} value={openAdoptions} href="/adoptions" />}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={t("home.todo")} actions={<span className="text-xs text-stone-500">{t("home.todoHelp")}</span>}>
            {todoGroups.length === 0 ? <p className="py-4 text-sm text-stone-600">{t("home.allGood")}</p> : (
              <>
                <ul className="divide-y divide-stone-100">
                  {todoGroups.slice(0, TODO_CAT_LIMIT).map((g) => <DueRow key={g.animalId || g.items[0].key} group={g} cards={cardMap} t={t} today={today} />)}
                </ul>
                {todoGroups.length > TODO_CAT_LIMIT && (
                  <details className="group">
                    <summary className={`${linkCls} cursor-pointer list-none py-2 text-sm font-medium group-open:hidden`}>{t("cal.more", { count: todoGroups.length - TODO_CAT_LIMIT })}</summary>
                    <ul className="divide-y divide-stone-100">
                      {todoGroups.slice(TODO_CAT_LIMIT).map((g) => <DueRow key={g.animalId || g.items[0].key} group={g} cards={cardMap} t={t} today={today} />)}
                    </ul>
                  </details>
                )}
              </>
            )}
          </Card>
          {staleGroups.length > 0 && (
            <details className="rounded-2xl border border-stone-200/80 bg-white p-4 sm:p-5">
              <summary className="cursor-pointer list-none">
                <span className="text-base font-semibold text-stone-900">{t("home.stale", { count: stale.length })}</span>
                <span className="mt-0.5 block text-sm text-stone-500">{t("home.staleHelp", { days: STALE_DAYS })}</span>
              </summary>
              <ul className="mt-2 divide-y divide-stone-100">
                {staleGroups.map((g) => <DueRow key={g.animalId || g.items[0].key} group={g} cards={cardMap} t={t} today={today} />)}
              </ul>
            </details>
          )}
        </div>

        <div className="space-y-4">
          <Card title={t("dash.myShifts")}>
            {myShifts.length === 0 ? <p className="text-sm text-stone-500">{t("dash.noShifts")}</p> : (
              <ul className="space-y-2">
                {myShifts.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3 text-sm">
                    <Link className={linkCls} href={`/calendar/${e.id}`}>{e.title}</Link>
                    <span className="shrink-0 text-stone-500">{fmtDate(e.startOn)} {e.startTime}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t("home.openShifts")}>
            {shiftsToFill.length === 0 ? <p className="text-sm text-stone-500">{t("home.noOpenShifts")}</p> : (
              <ul className="space-y-2">
                {shiftsToFill.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <Link className={linkCls} href={`/calendar/${e.id}`}>{e.title}</Link>
                    <Badge tone="amber">{t("home.seats", { taken: e.taken, total: e.capacity ?? 0 })}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t("home.logistics")}>
            {logistics.length === 0 ? <p className="text-sm text-stone-500">{t("home.noLogistics")}</p> : (
              <ul className="space-y-2">
                {logistics.map((e) => {
                  const leaving = e.startOn >= today && e.startOn <= in14;
                  return (
                    <li key={e.id} className="text-sm">
                      <Link className={linkCls} href={`/calendar/${e.id}`}>{e.title}</Link>
                      <span className="block text-xs text-stone-500">{leaving ? t("cal.leaves") : t("cal.returns")} · {fmtDate(leaving ? e.startOn : e.endOn)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
