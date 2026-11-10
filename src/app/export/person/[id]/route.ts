import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { audit, currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Everything stored about one person, as a file to hand over when they ask for their data. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "people:export")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const [person] = await db.select().from(s.people).where(eq(s.people.id, id));
  if (!person) return new Response("Not found", { status: 404 });
  const [placements, adoptions, events] = await Promise.all([
    db
      .select({ animal: s.animals.name, kind: s.placements.kind, startDate: s.placements.startDate, startText: s.placements.startText, endDate: s.placements.endDate, notes: s.placements.notes, current: s.placements.open })
      .from(s.placements)
      .innerJoin(s.animals, eq(s.animals.id, s.placements.animalId))
      .where(eq(s.placements.personId, id)),
    db.select().from(s.adoptionCases).where(eq(s.adoptionCases.personId, id)),
    db.select({ title: s.calendarEvents.title, type: s.calendarEvents.type, startOn: s.calendarEvents.startOn, endOn: s.calendarEvents.endOn, notes: s.calendarEvents.notes }).from(s.calendarEvents).where(eq(s.calendarEvents.personId, id)),
  ]);
  await audit(user.id, "export.person", "person", id);
  const body = {
    exportedAt: new Date().toISOString(),
    note: "Structured records linked to this person. Free-text notes on animals may mention them too and are not included.",
    person: {
      name: person.name, phones: person.phones, email: person.email, address: person.address, notes: person.notes,
      fosterRating: person.fosterRating, consentNote: person.consentNote, createdAt: person.createdAt, updatedAt: person.updatedAt, erasedAt: person.erasedAt,
    },
    placements,
    adoptionCases: adoptions.map(({ id: _id, animalId: _a, personId: _p, ...rest }) => rest),
    calendarEvents: events,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="greencats-person-${id.slice(0, 8)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
