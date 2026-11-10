import "server-only";
import { pg } from "@/db";
import { sterilizationDue } from "@/lib/medical-schedule";
import { redactPhones, type Actor } from "@/lib/permissions";

export const CARE_STATUSES = ["in_shelter", "clinic", "foster", "foster_adoption"] as const;

export type DueItem = {
  key: string;
  kind: string;
  dueOn: string;
  animalId: string;
  animalName: string;
  source: "medical" | "adoption";
};

/**
 * Everything needing action for animals in the shelter's care, from one place
 * so the dashboard, calendar and reports always agree. Only the newest record
 * of each kind counts, so giving a dose clears the reminder.
 * An adoption case's cat name is typed by hand, so it is hidden like any other text for `actor`.
 */
export async function getDueItems(actor: Actor, range?: { from: string; to: string }): Promise<DueItem[]> {
  const medical = await pg<{ animal_id: string; kind: string; next_due_on: string; name: string }[]>`
    select * from (
      select distinct on (m.animal_id, m.kind)
        m.animal_id, m.kind::text, m.next_due_on::text, a.name
      from medical_records m
      join animals a on a.id = m.animal_id
      where a.status::text in ${pg([...CARE_STATUSES])}
      order by m.animal_id, m.kind, m.date desc nulls last, m.created_at desc
    ) latest
    where next_due_on is not null`;

  const unsterilized = await pg<{ id: string; name: string; birth_date: string }[]>`
    select id, name, birth_date::text from animals
    where status::text in ${pg([...CARE_STATUSES])}
      and sterilized = 'no' and species = 'cat'
      and birth_date is not null and birth_precision <> 'year'`;

  const adoptions = await pg<{ id: string; animal_id: string | null; animal_name: string; next_step_on: string }[]>`
    select id, animal_id, animal_name, next_step_on::text from adoption_cases
    where stage <> 'done' and next_step_on is not null`;

  const items: DueItem[] = [
    ...medical.map((r) => ({
      key: `${r.animal_id}:${r.kind}`, kind: r.kind, dueOn: r.next_due_on,
      animalId: r.animal_id, animalName: r.name, source: "medical" as const,
    })),
    ...unsterilized.map((r) => ({
      key: `${r.id}:sterilization`, kind: "sterilization", dueOn: sterilizationDue(r.birth_date),
      animalId: r.id, animalName: r.name, source: "medical" as const,
    })),
    ...adoptions.map((r) => ({
      key: `case:${r.id}`, kind: "adoption_step", dueOn: r.next_step_on,
      animalId: r.animal_id ?? "", animalName: redactPhones(actor, r.animal_name), source: "adoption" as const,
    })),
  ];
  return items
    .filter((i) => !range || (i.dueOn >= range.from && i.dueOn <= range.to))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}
