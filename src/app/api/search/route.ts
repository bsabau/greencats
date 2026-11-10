import { pg } from "@/db";
import { statusLabel } from "@/components/ui";
import { CARE_STATUSES } from "@/domain/due";
import { getI18n } from "@/i18n";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const LIMIT = 8;

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("Unauthorized", { status: 401 });
  const term = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (term.length < 2) return Response.json([]);
  const { t } = await getI18n();
  const like = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  // Names and microchips only. Searching phone numbers would reveal them to volunteers,
  // and only someone who may see microchips can search by one.
  const chip = can(user, "microchip:view") ? like : null;
  const [animals, people] = await Promise.all([
    pg<{ id: string; name: string; status: string; location: string | null }[]>`
      select a.id, a.name, a.status::text, l.name location from animals a left join locations l on l.id = a.location_id
      where a.name ilike ${like} or array_to_string(a.aliases, ' ') ilike ${like} or a.microchip ilike ${chip}
      order by (a.status::text in ${pg([...CARE_STATUSES])}) desc, a.name limit ${LIMIT}`,
    pg<{ id: string; name: string }[]>`select id, name from people where name ilike ${like} and erased_at is null order by name limit ${LIMIT}`,
  ]);
  return Response.json([
    ...animals.map((a) => ({ href: `/animals/${a.id}`, title: a.name, subtitle: statusLabel(t, a.status, a.location) })),
    ...people.map((p) => ({ href: `/people/${p.id}`, title: p.name, subtitle: t("search.person") })),
  ]);
}
