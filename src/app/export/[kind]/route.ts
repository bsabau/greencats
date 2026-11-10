import { asc } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getDueItems } from "@/domain/due";
import { audit, currentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("Unauthorized", { status: 401 });
  const { kind } = await params;
  let csv: string;
  if (kind === "animals") {
    const rows = await db.select().from(s.animals).orderBy(asc(s.animals.name));
    csv = toCsv(
      ["name", "species", "status", "sex", "color", "birth_date", "intake_date", "sterilized", "health_book", "microchip", "passport"],
      rows.map((a) => [a.name, a.species, a.status, a.sex, a.color, a.birthDate, a.intakeDate, a.sterilized, a.healthBookNo, a.microchip, a.passport]),
    );
  } else if (kind === "due") {
    const rows = await getDueItems();
    csv = toCsv(["due_on", "animal", "type"], rows.map((d) => [d.dueOn, d.animalName, d.kind]));
  } else if (kind === "adoptions") {
    if (!can(user, "adoptions:export")) return new Response("Forbidden", { status: 403 });
    const rows = await db.select().from(s.adoptionCases).orderBy(asc(s.adoptionCases.animalName));
    await audit(user.id, "export.adoptions", "adoption", null, { rows: rows.length });
    csv = toCsv(
      ["animal", "adopter", "stage", "health_book", "contract", "vaccine", "microchip", "passport", "next_step", "notes"],
      rows.map((r) => [r.animalName, r.adopterName, r.stage, r.healthBook, r.contractNo, r.vaccine, r.microchip, r.passport, r.nextStepOn, r.notes]),
    );
  } else {
    return new Response("Not found", { status: 404 });
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="greencats-${kind}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
