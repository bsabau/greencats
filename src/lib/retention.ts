import "server-only";
import { pg } from "@/db";

const DEFAULT_DAYS = 5 * 365;
const DEFAULT_AUDIT_DAYS = 365;

const days = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** How long personal data is kept after the last contact with a person. Set DATA_RETENTION_DAYS to change it. */
export const retentionDays = (): number => days(process.env.DATA_RETENTION_DAYS, DEFAULT_DAYS);

/** How long the change log is kept. Set AUDIT_RETENTION_DAYS to change it. */
export const auditRetentionDays = (): number => days(process.env.AUDIT_RETENTION_DAYS, DEFAULT_AUDIT_DAYS);

export type DuePerson = { id: string; name: string; lastActivity: string; reason: "placement" | "edit" | "adoption" | "event" | "visibility" | "created" };

/**
 * People whose last contact is older than the retention period.
 * Last contact is the newest of: a placement, an edit made in the app, an adoption case linked to
 * them, a calendar event linked to them, and a visibility case naming them as contact.
 * Anyone currently fostering, or with an adoption case not yet done, is never listed.
 * Erasing is a person's decision, so nothing here deletes.
 */
export async function getPeoplePastRetention(): Promise<DuePerson[]> {
  const rows = await pg<{ id: string; name: string; last_activity: string; reason: DuePerson["reason"] }[]>`
    select id, name, last_activity::date::text, reason from (
      select p.id, p.name, coalesce(a.at, p.created_at) last_activity, coalesce(a.reason, 'created') reason
      from people p
      left join lateral (
        select at, reason from (values
          ((select max(coalesce(pl.end_date, pl.start_date))::timestamptz from placements pl where pl.person_id = p.id), 'placement', 1),
          -- The import sets both timestamps together, so only a later change counts as an edit.
          (case when p.updated_at > p.created_at + interval '1 minute' then p.updated_at end, 'edit', 2),
          ((select max(greatest(ac.created_at, ac.updated_at, ac.next_step_on::timestamptz)) from adoption_cases ac where ac.person_id = p.id), 'adoption', 3),
          ((select max(coalesce(ev.end_on, ev.start_on))::timestamptz from calendar_events ev where ev.person_id = p.id), 'event', 4),
          ((select max(v.updated_at) from visibility_cases v
            where lower(trim(v.contact_name)) = lower(trim(p.name)) or lower(trim(v.interested_person)) = lower(trim(p.name))), 'visibility', 5)
        ) x(at, reason, rank)
        where at is not null
        order by at desc, rank desc
        limit 1
      ) a on true
      where p.erased_at is null
        and not exists (
          select 1 from placements pl join animals an on an.id = pl.animal_id
          where pl.person_id = p.id and pl.open and pl.kind in ('foster', 'foster_adoption')
            and an.status in ('foster', 'foster_adoption')
        )
        and not exists (select 1 from adoption_cases ac where ac.person_id = p.id and ac.stage <> 'done')
    ) y
    where last_activity < now() - make_interval(days => ${retentionDays()})
    order by last_activity`;
  return rows.map((r) => ({ id: r.id, name: r.name, lastActivity: r.last_activity, reason: r.reason }));
}

/** The change log is personal data about volunteers, so entries older than its own retention period go. */
export async function purgeOldAuditEntries(): Promise<number> {
  const rows = await pg`delete from audit_log where created_at < now() - make_interval(days => ${auditRetentionDays()}) returning 1`;
  return rows.length;
}
