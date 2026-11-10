import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, pg, schema as s } from "@/db";

export const ERASED_NAME = "Persoană ștearsă";
// A shorter name would match inside unrelated words.
const MIN_NAME_TO_MATCH = 3;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The name as a whole word, so "Ana" doesn't match inside "Banana". Postgres writes word edges as \m and \M. */
const wordPattern = (name: string) => `${/^[\p{L}\p{N}]/u.test(name) ? "\\m" : ""}${escapeRegex(name)}${/[\p{L}\p{N}]$/u.test(name) ? "\\M" : ""}`;

/**
 * Erases one person's data. The row stays, empty, so each cat still shows that it was placed,
 * and records linked to it stay linked to the empty row.
 * Cleared: the person's own fields, the notes and date text of their placements, what their
 * adoption cases say about them, the notes of events linked to them, their name in those events'
 * titles and in the change log of events, and visibility cases whose contact is exactly this name.
 * Other free text that mentions them is listed by `findMentions`, to be checked by hand.
 */
export async function erasePersonData(tx: Tx, id: string) {
  const [person] = await tx.select({ name: s.people.name }).from(s.people).where(and(eq(s.people.id, id), isNull(s.people.erasedAt)));
  if (!person) return;
  const name = person.name.trim();
  await tx
    .update(s.people)
    .set({
      name: ERASED_NAME, phones: [], email: null, address: null, notes: null, consentNote: null,
      fosterRating: "unrated", externalCase: false, erasedAt: new Date(), updatedAt: new Date(),
    })
    .where(eq(s.people.id, id));
  await tx.update(s.placements).set({ notes: null, startText: null }).where(eq(s.placements.personId, id));
  // The paperwork about the cat (health book, vaccine, chip, passport) stays. What concerns the adopter goes.
  await tx
    .update(s.adoptionCases)
    .set({ adopterName: null, contractNo: null, notes: null, statusNote: null, updatedAt: new Date() })
    .where(eq(s.adoptionCases.personId, id));
  const events = await tx.select({ id: s.calendarEvents.id }).from(s.calendarEvents).where(eq(s.calendarEvents.personId, id));
  if (name.length >= MIN_NAME_TO_MATCH) {
    const pattern = wordPattern(name);
    if (events.length) {
      await tx
        .update(s.calendarEvents)
        .set({ title: sql`regexp_replace(${s.calendarEvents.title}, ${pattern}, ${ERASED_NAME}, 'gi')`, notes: null })
        .where(inArray(s.calendarEvents.id, events.map((e) => e.id)));
    }
    // Event titles are copied into the change log when an event is created or deleted.
    await tx
      .update(s.auditLog)
      .set({ detail: sql`jsonb_set(${s.auditLog.detail}, '{title}', to_jsonb(regexp_replace(${s.auditLog.detail}->>'title', ${pattern}, ${ERASED_NAME}, 'gi')))` })
      .where(and(eq(s.auditLog.entity, "event"), sql`${s.auditLog.detail}->>'title' ~* ${pattern}`));
  } else if (events.length) {
    await tx.update(s.calendarEvents).set({ notes: null }).where(inArray(s.calendarEvents.id, events.map((e) => e.id)));
  }
  // An exact match is safe whatever the length of the name.
  await tx
    .update(s.visibilityCases)
    .set({ contactName: null })
    .where(sql`lower(trim(${s.visibilityCases.contactName})) = lower(${name})`);
  await tx
    .update(s.visibilityCases)
    .set({ interestedPerson: null })
    .where(sql`lower(trim(${s.visibilityCases.interestedPerson})) = lower(${name})`);
}

export type Mention = { kind: "animal" | "medical" | "event" | "adoption" | "visibility"; label: string; href: string };

/**
 * Free text elsewhere that contains this person's name and isn't cleaned when they are erased:
 * a cat's notes, medical records, other events, other adoption and visibility cases.
 * Shown before erasing, because afterwards the name is gone and can't be searched for.
 */
export async function findMentions(id: string): Promise<Mention[]> {
  const [person] = await db.select({ name: s.people.name }).from(s.people).where(and(eq(s.people.id, id), isNull(s.people.erasedAt)));
  const name = person?.name.trim() ?? "";
  if (name.length < MIN_NAME_TO_MATCH) return [];
  const word = wordPattern(name);
  const rows = await pg<{ kind: Mention["kind"]; label: string; target: string }[]>`
    select 'animal' kind, name label, id::text target from animals
    where concat_ws(' ', location_note, current_treatment, intake_history, medical_summary, other_info, refill_notes, death_note,
      contract_text, birth_text, intake_text, sterilized_text, color, health_book_no, passport) ~* ${word}
    union all
    select distinct 'medical', a.name, a.id::text from medical_records m join animals a on a.id = m.animal_id
    where concat_ws(' ', m.description, m.raw_text) ~* ${word}
    union all
    select 'event', title, id::text from calendar_events
    where person_id is distinct from ${id} and concat_ws(' ', title, notes) ~* ${word}
    union all
    select 'adoption', animal_name, id::text from adoption_cases
    where person_id is distinct from ${id} and concat_ws(' ', adopter_name, notes, status_note) ~* ${word}
    union all
    select 'visibility', animal_name, id::text from visibility_cases
    -- A contact that is exactly this name is cleared on erasure, so only the rest of the case is searched.
    where concat_ws(' ', details, extra, description, info_sheet,
      case when lower(trim(contact_name)) = lower(${name}) then null else contact_name end,
      case when lower(trim(interested_person)) = lower(${name}) then null else interested_person end) ~* ${word}
    limit 100`;
  const href = (kind: Mention["kind"], target: string) =>
    kind === "animal" ? `/animals/${target}` : kind === "medical" ? `/animals/${target}?tab=medical` : kind === "event" ? `/calendar/${target}` : `/${kind === "adoption" ? "adoptions" : "visibility"}`;
  return rows.map((r) => ({ kind: r.kind, label: r.label, href: href(r.kind, r.target) }));
}
