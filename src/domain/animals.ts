import "server-only";
import { pg } from "@/db";
import { todayIso } from "@/lib/dates";
import { getDueItems } from "./due";

export type AnimalCard = {
  id: string;
  name: string;
  aliases: string[];
  status: string;
  sex: string;
  color: string | null;
  birthDate: string | null;
  birthPrecision: string | null;
  microchip: string | null;
  photoId: string | null;
  personName: string | null;
  fivPositive: boolean;
  overdue: number;
};

/** Everything a cat's card needs, in one query, so lists never fetch per cat. */
export async function getAnimalCards(): Promise<AnimalCard[]> {
  const [rows, due] = await Promise.all([
    pg<{ id: string; name: string; aliases: string[]; status: string; sex: string; color: string | null; birth_date: string | null; birth_precision: string | null; microchip: string | null; photo_id: string | null; person_name: string | null; fiv: string | null }[]>`
      select a.id, a.name, a.aliases, a.status::text, a.sex::text, a.color, a.birth_date::text, a.birth_precision::text, a.microchip,
        (select p.id from photos p where p.animal_id = a.id order by p.created_at limit 1) photo_id,
        (select pe.name from placements pl join people pe on pe.id = pl.person_id
          where pl.animal_id = a.id and pl.open order by pl.start_date desc nulls last limit 1) person_name,
        (select m.result::text from medical_records m
          where m.animal_id = a.id and m.kind = 'test_fiv_felv' and m.result is not null
          order by m.date desc nulls last limit 1) fiv
      from animals a order by lower(a.name)`,
    getDueItems(),
  ]);
  const today = todayIso();
  const overdue = new Map<string, number>();
  for (const d of due) if (d.dueOn < today) overdue.set(d.animalId, (overdue.get(d.animalId) ?? 0) + 1);
  return rows.map((r) => ({
    id: r.id, name: r.name, aliases: r.aliases, status: r.status, sex: r.sex, color: r.color,
    birthDate: r.birth_date, birthPrecision: r.birth_precision, microchip: r.microchip,
    photoId: r.photo_id, personName: r.person_name, fivPositive: r.fiv === "positive", overdue: overdue.get(r.id) ?? 0,
  }));
}
