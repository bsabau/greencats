import { and, gte, lte, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Card, Empty, Flash, Page, btn, btnGhost, linkCls } from "@/components/ui";
import { db, schema as s } from "@/db";
import { getDueItems } from "@/domain/due";
import { getI18n, type Key } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { redactPhones } from "@/lib/permissions";
import { todayIso } from "@/lib/dates";

type Item = { key: string; date: string; label: string; type: string; href: string; time?: string | null };

const TYPES = ["medical", "foster_logistics", "adoption", "shift", "other"] as const;
const CHIP: Record<string, string> = {
  medical: "bg-red-100 text-red-900", foster_logistics: "bg-sky-100 text-sky-900", adoption: "bg-violet-100 text-violet-900",
  shift: "bg-brand-100 text-brand-900", other: "bg-stone-200 text-stone-800",
};
const DOT: Record<string, string> = { medical: "bg-red-500", foster_logistics: "bg-sky-500", adoption: "bg-violet-500", shift: "bg-brand-500", other: "bg-stone-400" };
const MAX_IN_CELL = 3;
const pad = (n: number) => String(n).padStart(2, "0");

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string; type?: string; error?: string; saved?: string }> }) {
  const user = await requireUser();
  const { t, fmtDate, fmtMonth } = await getI18n();
  const params = await searchParams;
  const today = todayIso();
  const month = /^\d{4}-\d{2}$/.test(params.m ?? "") ? params.m! : today.slice(0, 7);
  const [year, mon] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${pad(lastDay)}`;
  const typeFilter = TYPES.includes(params.type as (typeof TYPES)[number]) ? params.type : undefined;

  const [events, due] = await Promise.all([
    db
      .select({
        e: s.calendarEvents,
        signups: sql<number>`(select count(*)::int from shift_signups ss where ss.event_id = ${s.calendarEvents.id})`,
      })
      .from(s.calendarEvents)
      .where(or(and(gte(s.calendarEvents.startOn, from), lte(s.calendarEvents.startOn, to)), and(gte(s.calendarEvents.endOn, from), lte(s.calendarEvents.endOn, to)))),
    getDueItems(user, { from, to }),
  ]);

  const items: Item[] = [];
  for (const { e: stored, signups } of events) {
    const e = { ...stored, title: redactPhones(user, stored.title) };
    const href = `/calendar/${e.id}`;
    const seats = e.type === "shift" && e.capacity ? ` (${signups}/${e.capacity})` : "";
    const inMonth = (d: string) => d >= from && d <= to;
    // A long absence is marked on its two ends, so it doesn't fill every day between them.
    if (inMonth(e.startOn)) {
      items.push({ key: `${e.id}:s`, date: e.startOn, type: e.type, href, time: e.startTime, label: `${e.title}${seats}${e.endOn && e.type === "foster_logistics" ? ` · ${t("cal.leaves")}` : ""}` });
    }
    if (e.endOn && e.endOn !== e.startOn && inMonth(e.endOn)) {
      items.push({ key: `${e.id}:e`, date: e.endOn, type: e.type, href, label: `${e.title} · ${t("cal.returns")}` });
    }
  }
  for (const d of due) {
    items.push({
      key: d.key, date: d.dueOn, type: d.source === "adoption" ? "adoption" : "medical",
      href: d.animalId ? `/animals/${d.animalId}?tab=medical` : "/adoptions",
      label: `${d.animalName} · ${t(`kind.${d.kind}` as Key)}`,
    });
  }
  const visible = items.filter((i) => !typeFilter || i.type === typeFilter).sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
  const byDay = new Map<string, Item[]>();
  for (const i of visible) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);

  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(params.d ?? "") && params.d!.startsWith(month);
  const selected = validDay ? params.d! : today.startsWith(month) ? today : ([...byDay.keys()][0] ?? from);
  const selectedItems = byDay.get(selected) ?? [];

  const leading = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => `${month}-${pad(i + 1)}`),
  ];
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, mon - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  };
  const link = (m: string, type?: string, day?: string) => `/calendar?m=${m}${type ? `&type=${type}` : ""}${day ? `&d=${day}` : ""}`;
  const days: Key[] = ["cal.mon", "cal.tue", "cal.wed", "cal.thu", "cal.fri", "cal.sat", "cal.sun"];

  const dayList = (list: Item[]) => (
    <ul className="space-y-1.5">
      {list.map((i) => (
        <li key={i.key} className="flex items-baseline gap-2 text-sm">
          <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 self-start rounded-full ${DOT[i.type]}`} />
          <span className="min-w-0">
            {i.time && <span className="mr-1 tabular-nums text-stone-500">{i.time}</span>}
            <Link className={linkCls} href={i.href}>{i.label}</Link>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <Page title={t("cal.title")} actions={<Link className={btn} href={`/calendar/new?date=${selected}`}>{t("cal.new")}</Link>}>
      <Flash params={params} t={t} />
      <div className="flex flex-wrap items-center gap-2">
        <Link className={btnGhost} href={link(shift(-1), typeFilter)} scroll={false} aria-label={t("cal.prev")}>←</Link>
        <h2 className="min-w-40 text-center text-lg font-semibold capitalize text-stone-900">{fmtMonth(year, mon)}</h2>
        <Link className={btnGhost} href={link(shift(1), typeFilter)} scroll={false} aria-label={t("cal.next")}>→</Link>
        <Link className={btnGhost} href={link(today.slice(0, 7), typeFilter)} scroll={false}>{t("common.today")}</Link>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link scroll={false} href={link(month)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${!typeFilter ? "bg-brand-700 font-semibold text-white" : "border border-stone-200 bg-white text-stone-700"}`}>{t("common.all")}</Link>
        {TYPES.map((v) => (
          <Link key={v} scroll={false} href={link(month, v)} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${typeFilter === v ? "bg-brand-700 font-semibold text-white" : "border border-stone-200 bg-white text-stone-700"}`}>
            <span aria-hidden className={`h-2 w-2 rounded-full ${DOT[v]}`} />{t(`event.${v}` as Key)}
          </Link>
        ))}
      </div>

      <div className="hidden items-start gap-4 md:grid lg:grid-cols-[1fr_20rem]">
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-200">
          <div className="grid grid-cols-7 gap-px text-center text-xs font-semibold text-stone-500">
            {days.map((d) => <div key={d} className="bg-stone-50 py-2">{t(d)}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px border-t border-stone-200">
            {cells.map((date, idx) => {
              if (!date) return <div key={`blank-${idx}`} className="min-h-28 bg-stone-50" />;
              const dayItems = byDay.get(date) ?? [];
              const medical = dayItems.filter((i) => i.type === "medical");
              const others = dayItems.filter((i) => i.type !== "medical");
              const shown = others.slice(0, MAX_IN_CELL);
              const hidden = others.length - shown.length;
              const isSelected = date === selected;
              return (
                <div key={date} className={`relative min-h-28 p-1.5 ${isSelected ? "bg-brand-50" : "bg-white hover:bg-stone-50"}`}>
                  {/* The whole cell selects the day; the chips above it open their own item. */}
                  <Link href={link(month, typeFilter, date)} scroll={false} aria-label={fmtDate(date)} className="absolute inset-0" />
                  <span className={`pointer-events-none relative inline-block rounded-full px-1.5 text-xs tabular-nums ${date === today ? "bg-brand-700 font-semibold text-white" : "text-stone-600"}`}>{Number(date.slice(8))}</span>
                  <div className="relative mt-1 space-y-0.5">
                    {shown.map((i) => (
                      <Link key={i.key} href={i.href} title={i.label} className={`block truncate rounded-md px-1 py-0.5 text-[11px] ${CHIP[i.type]}`}>{i.time ? `${i.time} ` : ""}{i.label}</Link>
                    ))}
                    {medical.length > 0 && (
                      <Link href={link(month, typeFilter, date)} scroll={false} className={`block truncate rounded-md px-1 py-0.5 text-[11px] ${CHIP.medical}`}>{t("cal.medicalSummary", { n: medical.length })}</Link>
                    )}
                    {hidden > 0 && <Link href={link(month, typeFilter, date)} scroll={false} className="block px-1 text-[11px] text-stone-500">{t("cal.more", { count: hidden })}</Link>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="lg:sticky lg:top-6">
          <Card title={fmtDate(selected)} actions={
            <Link href={`/calendar/new?date=${selected}`} aria-label={t("cal.addOnDay")} title={t("cal.addOnDay")} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"><Plus aria-hidden className="h-5 w-5" /></Link>
          }>
            {selectedItems.length === 0 ? <Empty t={t} /> : dayList(selectedItems)}
          </Card>
        </div>
      </div>

      <div className="md:hidden">
        <Card>
          {byDay.size === 0 ? <Empty t={t} /> : (
            <div className="space-y-4">
              {[...byDay.entries()].map(([date, list]) => (
                <div key={date}>
                  <h3 className={`mb-1 text-sm font-semibold ${date === today ? "text-brand-700" : "text-stone-800"}`}>{fmtDate(date)}</h3>
                  {dayList(list)}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}
