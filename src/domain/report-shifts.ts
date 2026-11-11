import "server-only";
import { pg } from "@/db";
import type { Key, T } from "@/i18n";
import { redactPhones, type Actor } from "@/lib/permissions";
import type { ReportFilters } from "@/lib/report-filters";
import { addDays } from "@/lib/dates";
import { UPCOMING_DAYS, longStays, summarizeShifts, type CareAnimal, type LongStay, type ShiftRow, type ShiftSummary } from "@/lib/report-shifts";
import type { ReportTable } from "@/lib/xlsx";
import { CARE_STATUSES } from "./due";

export type ShiftReport = { shifts: ShiftSummary; stays: { rows: LongStay[]; unknown: number } };

/**
 * Shift coverage in the range, and the animals in care the longest. Only sign-up counts are read,
 * never who signed up. Shift titles are typed by hand, so they are hidden for `actor` like other notes.
 */
export async function getShiftReport(actor: Actor, f: ReportFilters, today: string): Promise<ShiftReport> {
  const until = addDays(today, UPCOMING_DAYS);
  const first = f.from < today ? f.from : today;
  const last = f.to > until ? f.to : until;
  const [shifts, animals] = await Promise.all([
    pg<ShiftRow[]>`
      select e.id, e.title, e.start_on::text "startOn", e.start_time "startTime", e.capacity,
             (select count(*)::int from shift_signups s where s.event_id = e.id) signups
      from calendar_events e
      where e.type = 'shift' and e.start_on between ${first} and ${last}`,
    pg<CareAnimal[]>`
      select a.id, a.name, a.status::text status, l.name location, a.intake_date::text "intakeDate",
             a.intake_precision::text "intakePrecision",
             (select count(*)::int from photos p where p.animal_id = a.id) photos,
             (select max(m.date)::text from medical_records m where m.animal_id = a.id and m.date <= ${today}) "lastMedical"
      from animals a
      left join locations l on l.id = a.location_id
      where a.status::text in ${pg([...CARE_STATUSES])}
        ${f.species ? pg`and a.species = ${f.species}` : pg``}
        ${f.location ? pg`and a.location_id = ${f.location}` : pg``}`,
  ]);
  const shown = shifts.map((s) => ({ ...s, title: redactPhones(actor, s.title) }));
  return { shifts: summarizeShifts(shown, f.from, f.to, today), stays: longStays(animals, today) };
}

export async function getLocationOptions(): Promise<{ id: string; name: string }[]> {
  return pg`select id, name from locations order by active desc, lower(name)`;
}

const fuzzy = (date: string | null, precision: string | null) =>
  !date ? null : precision === "year" ? date.slice(0, 4) : precision === "month" ? date.slice(0, 7) : date;

export function shiftTables(r: ShiftReport, t: T): ReportTable[] {
  const percent = (filled: number, places: number) => (places > 0 ? Math.round((filled / places) * 1000) / 10 : null);
  return [
    {
      key: "shifts",
      label: t("rep.shift.monthly"),
      headers: [t("rep.month"), t("rep.shift.shifts"), t("rep.shift.places"), t("rep.shift.filled"), t("rep.shift.fillRate"), t("rep.shift.signups"), t("rep.shift.empty")],
      rows: r.shifts.monthly.map((m) => [m.month, m.shifts, m.places, m.filled, percent(m.filled, m.places), m.signups, m.empty]),
    },
    {
      key: "long_stays",
      label: t("rep.stays.title"),
      headers: [
        t("common.name"), t("common.status"), t("rep.location"), t("animals.intake"), t("rep.stays.days"),
        t("animals.photos"), t("rep.stays.lastMedical"),
      ],
      rows: r.stays.rows.map((a) => [
        a.name, t(`status.${a.status}` as Key), a.location, fuzzy(a.intakeDate, a.intakePrecision), a.days, a.photos, a.lastMedical,
      ]),
    },
  ];
}
