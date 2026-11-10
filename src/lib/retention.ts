import "server-only";
import { pg } from "@/db";

const DEFAULT_DAYS = 5 * 365;

/** How long personal data is kept after the last contact with a person. Set DATA_RETENTION_DAYS to change it. */
export function retentionDays(): number {
  const n = Number(process.env.DATA_RETENTION_DAYS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAYS;
}

export type DuePerson = { id: string; name: string; lastActivity: string; reason: "placement" | "edit" | "created" };

/**
 * People whose last contact is older than the retention period.
 * Last contact is the newest placement date, or the last edit made in the app.
 * Anyone currently fostering is never listed. Erasing is a person's decision, so nothing here deletes.
 */
export async function getPeoplePastRetention(): Promise<DuePerson[]> {
  const rows = await pg<{ id: string; name: string; last_activity: string; reason: DuePerson["reason"] }[]>`
    select id, name, last_activity::date::text, reason from (
      select p.id, p.name,
        coalesce(greatest(d.last_placement, e.edited_at), p.created_at) last_activity,
        case when d.last_placement is null and e.edited_at is null then 'created'
             when e.edited_at is not null and (d.last_placement is null or e.edited_at >= d.last_placement) then 'edit'
             else 'placement' end reason
      from people p
      left join lateral (
        select max(coalesce(pl.end_date, pl.start_date))::timestamptz last_placement
        from placements pl where pl.person_id = p.id
      ) d on true
      -- The import sets both timestamps together, so only a later change counts as an edit.
      left join lateral (
        select case when p.updated_at > p.created_at + interval '1 minute' then p.updated_at end edited_at
      ) e on true
      where p.erased_at is null
        and not exists (
          select 1 from placements pl join animals a on a.id = pl.animal_id
          where pl.person_id = p.id and pl.open and pl.kind in ('foster', 'foster_adoption')
            and a.status in ('foster', 'foster_adoption')
        )
    ) x
    where last_activity < now() - make_interval(days => ${retentionDays()})
    order by last_activity`;
  return rows.map((r) => ({ id: r.id, name: r.name, lastActivity: r.last_activity, reason: r.reason }));
}

/** The change log is personal data about volunteers, so entries older than the retention period go. */
export async function purgeOldAuditEntries(): Promise<number> {
  const rows = await pg`delete from audit_log where created_at < now() - make_interval(days => ${retentionDays()}) returning 1`;
  return rows.length;
}
