import "server-only";
import { pg } from "@/db";
import { addMonths, todayIso } from "@/lib/dates";
import { CARE_STATUSES } from "./due";

export const RECENT_MONTHS = 12;

export async function getReportData() {
  const today = todayIso();
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  const start = addMonths(firstOfMonth, -(RECENT_MONTHS - 1));
  const care = [...CARE_STATUSES];

  const [byStatus, [site], intakes, adoptions, [paperwork]] = await Promise.all([
    // Animals in the shelter are counted per location.
    pg<{ status: string; location: string | null; n: number }[]>`
      select a.status::text, l.name location, count(*)::int n from animals a
      left join locations l on l.id = a.location_id group by 1, 2 order by 3 desc`,
    // Definitions come from the workbook's "Date homepage site" rules.
    pg<{ sterilized: number; adopted: number; taken_in: number }[]>`
      select count(*) filter (where sterilized = 'yes' and species = 'cat')::int sterilized,
             count(*) filter (where status = 'adopted')::int adopted,
             count(*) filter (where species = 'cat' and status::text not in ('external', 'unknown'))::int taken_in
      from animals`,
    pg<{ m: string; n: number }[]>`
      select to_char(intake_date, 'YYYY-MM') m, count(*)::int n from animals
      where intake_date >= ${start} and intake_precision <> 'year' group by 1`,
    pg<{ m: string; n: number }[]>`
      select to_char(start_date, 'YYYY-MM') m, count(distinct animal_id)::int n from placements
      where kind = 'adoption' and start_date >= ${start} group by 1`,
    pg<{ no_book: number; no_chip: number; not_sterilized: number; no_fiv: number }[]>`
      select count(*) filter (where health_book_no is null)::int no_book,
             count(*) filter (where microchip is null)::int no_chip,
             count(*) filter (where sterilized <> 'yes')::int not_sterilized,
             count(*) filter (where not exists (
               select 1 from medical_records m where m.animal_id = a.id and m.kind = 'test_fiv_felv'
             ))::int no_fiv
      from animals a where status::text in ${pg(care)}`,
  ]);

  const intakeMap = new Map(intakes.map((r) => [r.m, r.n]));
  const adoptionMap = new Map(adoptions.map((r) => [r.m, r.n]));
  const flow = Array.from({ length: RECENT_MONTHS }, (_, i) => {
    const month = addMonths(start, i).slice(0, 7);
    return { month, intakes: intakeMap.get(month) ?? 0, adoptions: adoptionMap.get(month) ?? 0 };
  });
  return { byStatus, site, flow, paperwork };
}
