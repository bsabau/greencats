import { pg } from "@/db";
import { getI18n, type Key } from "@/i18n";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
const LIMIT = 8;

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("Unauthorized", { status: 401 });
  const term = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (term.length < 2) return Response.json([]);
  const { t } = await getI18n();
  const like = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  // Names and microchips only. Searching phone numbers would reveal them to volunteers.
  const [animals, people] = await Promise.all([
    pg<{ id: string; name: string; status: string }[]>`
      select id, name, status::text from animals
      where name ilike ${like} or array_to_string(aliases, ' ') ilike ${like} or microchip ilike ${like}
      order by (status::text in ('casuta','ana_adi','clinic','foster','foster_adoption')) desc, name limit ${LIMIT}`,
    pg<{ id: string; name: string }[]>`select id, name from people where name ilike ${like} and erased_at is null order by name limit ${LIMIT}`,
  ]);
  return Response.json([
    ...animals.map((a) => ({ href: `/animals/${a.id}`, title: a.name, subtitle: t(`status.${a.status}` as Key) })),
    ...people.map((p) => ({ href: `/people/${p.id}`, title: p.name, subtitle: t("search.person") })),
  ]);
}
