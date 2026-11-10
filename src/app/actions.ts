"use server";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import {
  audit,
  deleteDeadSessions,
  endSession,
  hashPassword,
  placeholderHash,
  requirePermission,
  requireUser,
  startSession,
  verifyPassword,
} from "@/lib/auth";
import { addDays, todayIso } from "@/lib/dates";
import { loginLimit, passwordChangeBlocked, recordLoginFailure, recordLoginSuccess, recordPasswordChangeFailure } from "@/lib/login-limits";
import { MAX_NAME, date, int, oneOf, text, time, uuid } from "@/lib/forms";
import { linkMedicalRecords } from "@/lib/catalog";
import { cleanPhoto } from "@/lib/photos";
import { PRODUCT_KINDS, nextDue } from "@/lib/medical-schedule";
import { normalizeTerm, parseAliases } from "@/lib/product-match";
import { ANIMAL_EDITABLE_TEXT_FIELDS, ANIMAL_TEXT_FIELDS, can, hasHidden } from "@/lib/permissions";
import { erasePersonData } from "@/domain/people";
import { getPeoplePastRetention, purgeOldAuditEntries } from "@/lib/retention";
import { parsePhones } from "@/lib/import-helpers";

const MIN_PASSWORD = 12;
const MAX_PASSWORD = 1000;
const MAX_ALIASES = 50;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const uploadDir = () => process.env.UPLOAD_DIR ?? "./uploads";
const fail = (to: string, code: string): never => redirect(`${to}${to.includes("?") ? "&" : "?"}error=${code}`);
const saved = (to: string): never => redirect(`${to}${to.includes("?") ? "&" : "?"}saved=1`);
/** Only paths inside this app. "//host" and "/\\host" would send the browser to another site. */
const safeBack = (back: string | null | undefined, fallback: string) =>
  back && /^\/(?![/\\])/.test(back) ? back : fallback;
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// ---- Account --------------------------------------------------------------------
export async function login(fd: FormData) {
  const email = (text(fd, "email", MAX_NAME) ?? "").toLowerCase();
  const password = (text(fd, "password") ?? "").slice(0, MAX_PASSWORD);
  // Behind Caddy this header holds the visitor's address. Caddy discards any value the visitor sent.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (loginLimit(email, ip) === "blocked") fail("/login", "locked");
  const [user] = await db.select().from(s.users).where(eq(s.users.email, email));
  // Check a placeholder hash for unknown accounts, so response time doesn't reveal which emails exist.
  const ok = await verifyPassword(user?.passwordHash ?? (await placeholderHash()), password);
  if (!user || !user.active || !ok) {
    recordLoginFailure(email, ip);
    // People sometimes type a password into the address box, so only text that looks like an address is kept.
    await audit(user?.id ?? null, "login.failed", "user", user?.id ?? null, email.includes("@") ? { email: email.slice(0, 60) } : undefined);
    fail("/login", "login");
    return;
  }
  recordLoginSuccess(email, ip);
  // A password shorter than the minimum can only come from outside the app. It must be replaced,
  // unless this is a local trial stack that says so.
  const weak = password.length < MIN_PASSWORD && process.env.ALLOW_WEAK_PASSWORDS !== "true";
  if (weak && !user.mustChangePassword) await db.update(s.users).set({ mustChangePassword: true }).where(eq(s.users.id, user.id));
  await startSession(user.id, user.locale);
  await audit(user.id, "login", "user", user.id);
  await deleteDeadSessions();
  await purgeOldAuditEntries();
  redirect(user.mustChangePassword || weak ? "/account?error=must_change" : "/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function setLanguage(fd: FormData) {
  const user = await requireUser({ allowPasswordChange: true });
  const locale = oneOf(fd, "locale", ["ro", "en"] as const, "ro");
  await db.update(s.users).set({ locale }).where(eq(s.users.id, user.id));
  (await cookies()).set("locale", locale, { sameSite: "lax", path: "/", maxAge: 31_536_000 });
  redirect(safeBack(text(fd, "back"), "/account"));
}

export async function changePassword(fd: FormData) {
  const user = await requireUser({ allowPasswordChange: true });
  const next = text(fd, "next") ?? "";
  if (next.length < MIN_PASSWORD) fail("/account", "password_short");
  if (next.length > MAX_PASSWORD) fail("/account", "password_long");
  if (passwordChangeBlocked(user.id)) fail("/account", "locked");
  if (!(await verifyPassword(user.passwordHash, (text(fd, "current") ?? "").slice(0, MAX_PASSWORD)))) {
    recordPasswordChangeFailure(user.id);
    fail("/account", "password_wrong");
  }
  await db.update(s.users).set({ passwordHash: await hashPassword(next), mustChangePassword: false }).where(eq(s.users.id, user.id));
  await db.delete(s.sessions).where(eq(s.sessions.userId, user.id));
  await startSession(user.id, user.locale);
  await audit(user.id, "password.change", "user", user.id);
  saved("/account");
}

// ---- Animals --------------------------------------------------------------------
const STATUSES = s.animalStatusEnum.enumValues;
const SEXES = s.sexEnum.enumValues;
const STERILIZED = s.sterilizedEnum.enumValues;
const SPECIES = s.speciesEnum.enumValues;

function animalFields(fd: FormData) {
  return {
    name: text(fd, "name", MAX_NAME) ?? "",
    species: oneOf(fd, "species", SPECIES, "cat"),
    sex: oneOf(fd, "sex", SEXES, "unknown"),
    color: text(fd, "color"),
    birthDate: date(fd, "birthDate"),
    intakeDate: date(fd, "intakeDate"),
    sterilized: oneOf(fd, "sterilized", STERILIZED, "unknown"),
    healthBookNo: text(fd, "healthBookNo"),
    microchip: text(fd, "microchip"),
    passport: text(fd, "passport"),
    currentTreatment: text(fd, "currentTreatment"),
    intakeHistory: text(fd, "intakeHistory"),
    medicalSummary: text(fd, "medicalSummary"),
    otherInfo: text(fd, "otherInfo"),
    locationNote: text(fd, "locationNote"),
  };
}

/**
 * The shelter location sent with a status. Only "in_shelter" has one, and it is required
 * unless no location is active. An inactive location is accepted only when it is the
 * animal's current one, so re-saving doesn't drop it.
 */
async function locationFor(fd: FormData, status: string, current: string | null, to: string) {
  if (status !== "in_shelter") return null;
  const raw = text(fd, "locationId");
  if (!raw) {
    const [active] = await db.select({ id: s.locations.id }).from(s.locations).where(eq(s.locations.active, true)).limit(1);
    if (active || current) fail(to, "location_required");
    return null;
  }
  const locationId = isUuid(raw) ? raw : fail(to, "invalid");
  const [location] = await db.select({ active: s.locations.active }).from(s.locations).where(eq(s.locations.id, locationId));
  if (!location || (!location.active && locationId !== current)) fail(to, "invalid");
  return locationId;
}

export async function createAnimal(fd: FormData) {
  const user = await requirePermission("animals:edit");
  const fields = animalFields(fd);
  if (!fields.name) fail("/animals/new", "invalid");
  const status = oneOf(fd, "status", STATUSES, "in_shelter");
  const locationId = await locationFor(fd, status, null, "/animals/new");
  const [row] = await db
    .insert(s.animals)
    .values({
      ...fields,
      status,
      locationId,
      birthPrecision: fields.birthDate ? "day" : null,
      intakePrecision: fields.intakeDate ? "day" : null,
    })
    .returning({ id: s.animals.id });
  await audit(user.id, "animal.create", "animal", row.id, { name: fields.name, status, locationId });
  redirect(`/animals/${row.id}`);
}

const PRIVATE_IN_LOG = new Set<string>([...ANIMAL_TEXT_FIELDS, "microchip"]);

export async function updateAnimal(id: string, fd: FormData) {
  const user = await requirePermission("animals:edit");
  const fields = animalFields(fd);
  const to = `/animals/${id}`;
  if (!fields.name) fail(to, "invalid");
  const [before] = await db.select().from(s.animals).where(eq(s.animals.id, id));
  if (!before) fail("/animals", "invalid");
  // A field holding contact details the user can't see is read-only in their form and isn't sent.
  // Whatever arrives for it, the stored text stays, so hidden details are never lost or replaced by the marker.
  for (const key of ANIMAL_EDITABLE_TEXT_FIELDS) {
    if (hasHidden(user, before[key])) fields[key] = before[key];
  }
  // The same for a microchip the user may not see. Someone who can't see it can still add a missing one.
  if (before.microchip && !can(user, "microchip:view")) fields.microchip = before.microchip;
  // An exact date typed in the form replaces an approximate one. An untouched approximate date stays approximate.
  const precision = (typed: string | null, old: string | null, oldPrecision: typeof before.birthPrecision) =>
    !typed ? null : typed === old ? oldPrecision : ("day" as const);
  await db
    .update(s.animals)
    .set({
      ...fields,
      birthPrecision: precision(fields.birthDate, before.birthDate, before.birthPrecision),
      intakePrecision: precision(fields.intakeDate, before.intakeDate, before.intakePrecision),
      sterilizedText: fields.sterilized === before.sterilized ? before.sterilizedText : null,
      updatedAt: new Date(),
    })
    .where(eq(s.animals.id, id));
  // Text fields can hold contact details and the microchip is personal data, so the log records
  // that they changed, not what they said.
  const changed = Object.fromEntries(
    Object.entries(fields).filter(([k, v]) => before[k as keyof typeof before] !== v)
      .map(([k, v]) => [k, PRIVATE_IN_LOG.has(k) ? "changed" : { from: before[k as keyof typeof before], to: v }]),
  );
  await audit(user.id, "animal.update", "animal", id, changed);
  saved(to);
}

const KIND_FOR_STATUS = {
  foster: "foster",
  foster_adoption: "foster_adoption",
  adoption_incomplete: "adoption_incomplete",
  adopted: "adoption",
} as const;

export async function moveAnimal(id: string, fd: FormData) {
  const user = await requirePermission("animals:edit");
  if (!isUuid(id)) fail("/animals", "invalid");
  const to = `/animals/${id}`;
  const status = oneOf(fd, "status", STATUSES, "unknown");
  const on = date(fd, "date") ?? todayIso();
  const personId = uuid(fd, "personId");
  const kind = KIND_FOR_STATUS[status as keyof typeof KIND_FOR_STATUS];
  if (kind && !personId) fail(to, "person_required");
  const [before] = await db.select({ locationId: s.animals.locationId }).from(s.animals).where(eq(s.animals.id, id));
  if (!before) fail("/animals", "invalid");
  const locationId = await locationFor(fd, status, before.locationId, to);
  await db.transaction(async (tx) => {
    await tx
      .update(s.placements)
      .set({ open: false, endDate: on })
      .where(and(eq(s.placements.animalId, id), eq(s.placements.open, true)));
    if (kind && personId) {
      await tx.insert(s.placements).values({ animalId: id, personId, kind, startDate: on });
    }
    await tx
      .update(s.animals)
      .set({ status, locationId, updatedAt: new Date(), ...(status === "deceased" ? { deathDate: on } : {}) })
      .where(eq(s.animals.id, id));
  });
  await audit(user.id, "animal.move", "animal", id, { status, locationId, on, personId });
  saved(to);
}

const MEDICAL_KINDS = s.medicalKindEnum.enumValues;

export async function addMedicalRecord(animalId: string, fd: FormData) {
  const user = await requirePermission("medical:edit");
  const to = `/animals/${animalId}?tab=medical`;
  const kind = oneOf(fd, "kind", MEDICAL_KINDS, "note");
  const on = date(fd, "date");
  if (!on) fail(to, "invalid");
  const [animal] = await db.select().from(s.animals).where(eq(s.animals.id, animalId));
  if (!animal) fail("/animals", "invalid");
  const birth = animal.birthPrecision === "year" ? null : animal.birthDate;
  const resultValue = oneOf(fd, "result", ["", "positive", "negative"] as const, "");
  const productId = (PRODUCT_KINDS as readonly string[]).includes(kind) ? uuid(fd, "productId") : null;
  const [product] = productId ? await db.select().from(s.products).where(eq(s.products.id, productId)) : [];
  if (productId && (!product || !product.kinds.includes(kind))) fail(to, "invalid");
  const clinicId = uuid(fd, "clinicId");
  if (clinicId && !(await db.select({ id: s.clinics.id }).from(s.clinics).where(eq(s.clinics.id, clinicId))).length) fail(to, "invalid");
  const [row] = await db
    .insert(s.medicalRecords)
    .values({
      animalId,
      kind,
      date: on,
      precision: "day",
      description: text(fd, "description"),
      result: resultValue || null,
      nextDueOn: date(fd, "nextDueOn") ?? nextDue(kind, on!, birth, product?.intervalDays),
      productId,
      clinicId,
      createdBy: user.id,
    })
    .returning({ id: s.medicalRecords.id });
  if (kind === "sterilization") {
    await db.update(s.animals).set({ sterilized: "yes", sterilizedText: null, updatedAt: new Date() }).where(eq(s.animals.id, animalId));
  }
  await audit(user.id, "medical.add", "animal", animalId, { record: row.id, kind, on, product: product?.name ?? null });
  redirect(`/animals/${animalId}?tab=medical&saved=1`);
}

/** One-tap "done" on a reminder: records the treatment for today, which clears the reminder. */
export async function completeDue(animalId: string, kind: string, back: string) {
  const user = await requirePermission("medical:edit");
  const target = safeBack(back, "/");
  if (!isUuid(animalId)) fail(target, "invalid");
  if (!(MEDICAL_KINDS as readonly string[]).includes(kind)) fail(target, "invalid");
  const medicalKind = kind as (typeof MEDICAL_KINDS)[number];
  const [animal] = await db.select().from(s.animals).where(eq(s.animals.id, animalId));
  if (!animal) fail(target, "invalid");
  const today = todayIso();
  const birth = animal.birthPrecision === "year" ? null : animal.birthDate;
  // The same product as last time, if it is still in use. Its interval sets the next date.
  const [last] = await db
    .select({ product: s.products })
    .from(s.medicalRecords)
    .innerJoin(s.products, eq(s.products.id, s.medicalRecords.productId))
    .where(and(eq(s.medicalRecords.animalId, animalId), eq(s.medicalRecords.kind, medicalKind)))
    .orderBy(sql`${s.medicalRecords.date} desc nulls last`, desc(s.medicalRecords.createdAt))
    .limit(1);
  const product = last?.product.active ? last.product : null;
  const [row] = await db
    .insert(s.medicalRecords)
    .values({ animalId, kind: medicalKind, date: today, precision: "day", nextDueOn: nextDue(medicalKind, today, birth, product?.intervalDays), productId: product?.id ?? null, createdBy: user.id })
    .returning({ id: s.medicalRecords.id });
  if (medicalKind === "sterilization") {
    await db.update(s.animals).set({ sterilized: "yes", sterilizedText: null, updatedAt: new Date() }).where(eq(s.animals.id, animalId));
  }
  await audit(user.id, "medical.complete", "animal", animalId, { record: row.id, kind, on: today });
  redirect(`${target}${target.includes("?") ? "&" : "?"}done=${row.id}`);
}

export async function undoComplete(recordId: string, back: string) {
  const user = await requirePermission("medical:edit");
  const [record] = isUuid(recordId) ? await db.select().from(s.medicalRecords).where(eq(s.medicalRecords.id, recordId)) : [];
  if (record && record.createdBy === user.id) {
    await db.delete(s.medicalRecords).where(eq(s.medicalRecords.id, recordId));
    if (record.kind === "sterilization") {
      await db.update(s.animals).set({ sterilized: "no", updatedAt: new Date() }).where(eq(s.animals.id, record.animalId));
    }
    await audit(user.id, "medical.undo", "animal", record.animalId, { record: recordId, kind: record.kind });
  }
  redirect(safeBack(back, "/"));
}

export async function deleteMedicalRecord(animalId: string, recordId: string) {
  const user = await requirePermission("medical:edit");
  const to = `/animals/${animalId}?tab=medical`;
  if (!isUuid(animalId) || !isUuid(recordId)) fail("/animals", "invalid");
  const [before] = await db.select().from(s.medicalRecords).where(and(eq(s.medicalRecords.id, recordId), eq(s.medicalRecords.animalId, animalId)));
  if (!before) redirect(to);
  // Volunteers remove their own entries. Anyone else's history needs a coordinator.
  if (before.createdBy !== user.id && !can(user, "medical:delete_any")) fail(to, "denied");
  await db.delete(s.medicalRecords).where(eq(s.medicalRecords.id, recordId));
  await audit(user.id, "medical.delete", "animal", animalId, { record: recordId, kind: before.kind, date: before.date, nextDueOn: before.nextDueOn });
  redirect(to);
}

/** Removes a cat and everything attached to it. For records created by mistake. */
export async function deleteAnimal(id: string) {
  const user = await requirePermission("animals:delete");
  if (!isUuid(id)) fail("/animals", "invalid");
  const [animal] = await db.select({ name: s.animals.name }).from(s.animals).where(eq(s.animals.id, id));
  if (!animal) redirect("/animals");
  const files = await db.select({ fileName: s.photos.fileName }).from(s.photos).where(eq(s.photos.animalId, id));
  await db.delete(s.animals).where(eq(s.animals.id, id));
  for (const { fileName } of files) {
    await unlink(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ uploadDir(), path.basename(fileName))).catch(() => {});
  }
  await audit(user.id, "animal.delete", "animal", id, { name: animal.name, photos: files.length });
  saved("/animals");
}

export async function uploadPhoto(animalId: string, fd: FormData) {
  const user = await requirePermission("animals:edit");
  if (!isUuid(animalId)) fail("/animals", "invalid");
  const to = `/animals/${animalId}?tab=photos`;
  const [animal] = await db.select({ id: s.animals.id }).from(s.animals).where(eq(s.animals.id, animalId));
  if (!animal) fail("/animals", "invalid");
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_PHOTO_BYTES) {
    fail(to, "photo");
    return;
  }
  const photo = await cleanPhoto(Buffer.from(await file.arrayBuffer()));
  if (!photo) {
    fail(to, "photo");
    return;
  }
  const fileName = `${randomUUID()}.${photo.ext}`;
  const filePath = path.join(/*turbopackIgnore: true*/ uploadDir(), fileName);
  await mkdir(/*turbopackIgnore: true*/ uploadDir(), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ filePath, photo.buffer);
  try {
    await db.insert(s.photos).values({ animalId, fileName, contentType: photo.type });
  } catch (error) {
    // No row points to the file, so nothing would ever delete it.
    await unlink(/*turbopackIgnore: true*/ filePath).catch(() => {});
    throw error;
  }
  await audit(user.id, "photo.upload", "animal", animalId);
  saved(to);
}

// ---- People ---------------------------------------------------------------------
function personFields(fd: FormData) {
  return {
    name: text(fd, "name", MAX_NAME) ?? "",
    phones: (text(fd, "phones") ?? "").split(",").flatMap((p) => parsePhones(p)),
    email: text(fd, "email"),
    address: text(fd, "address"),
    notes: text(fd, "notes"),
    fosterRating: oneOf(fd, "fosterRating", s.fosterRatingEnum.enumValues, "unrated"),
    externalCase: fd.get("externalCase") === "on",
    consentNote: text(fd, "consentNote"),
  };
}

export async function createPerson(fd: FormData) {
  const user = await requirePermission("contacts:edit");
  const fields = personFields(fd);
  if (!fields.name) fail("/people/new", "invalid");
  const [row] = await db.insert(s.people).values(fields).returning({ id: s.people.id });
  await audit(user.id, "person.create", "person", row.id);
  redirect(`/people/${row.id}`);
}

export async function updatePerson(id: string, fd: FormData) {
  const user = await requirePermission("contacts:edit");
  const fields = personFields(fd);
  if (!isUuid(id)) fail("/people", "invalid");
  if (!fields.name) fail(`/people/${id}`, "invalid");
  // Erased records stay empty.
  await db.update(s.people).set({ ...fields, updatedAt: new Date() }).where(and(eq(s.people.id, id), isNull(s.people.erasedAt)));
  // Contact values stay out of the log, so the log doesn't become a second copy of them.
  await audit(user.id, "person.update", "person", id);
  saved(`/people/${id}`);
}

/**
 * Erases a person's data and keeps an empty row, so each cat still shows that it was placed.
 * Other text that mentions the person is listed on their page beforehand, to be cleaned by hand.
 */
export async function erasePerson(id: string, back: string) {
  const user = await requirePermission("privacy:manage");
  if (!isUuid(id)) fail("/people", "invalid");
  await db.transaction((tx) => erasePersonData(tx, id));
  await audit(user.id, "person.erase", "person", id);
  saved(safeBack(back, "/people"));
}

/** Erases everyone currently past the retention period. The list is worked out again here, not taken from the form. */
export async function erasePastRetention() {
  const user = await requirePermission("privacy:manage");
  const due = await getPeoplePastRetention();
  await db.transaction(async (tx) => {
    for (const person of due) await erasePersonData(tx, person.id);
  });
  await audit(user.id, "person.erase_batch", "person", null, { count: due.length, ids: due.map((p) => p.id) });
  saved("/admin/privacy");
}

// ---- Calendar -------------------------------------------------------------------
const EVENT_TYPES = s.eventTypeEnum.enumValues;
const MAX_REPEAT_WEEKS = 26;

export async function createEvent(fd: FormData) {
  const user = await requirePermission("calendar:edit");
  const title = text(fd, "title", MAX_NAME);
  const startOn = date(fd, "startOn");
  if (!title || !startOn) {
    fail("/calendar/new", "invalid");
    return;
  }
  const endOn = date(fd, "endOn");
  const repeat = int(fd, "repeat", 0, MAX_REPEAT_WEEKS) ?? 0;
  const type = oneOf(fd, "type", EVENT_TYPES, "other");
  const rows = Array.from({ length: repeat + 1 }, (_, week) => ({
    type,
    title,
    startOn: addDays(startOn, week * 7),
    endOn: endOn && endOn >= startOn ? addDays(endOn, week * 7) : null,
    startTime: time(fd, "startTime"),
    endTime: time(fd, "endTime"),
    notes: text(fd, "notes"),
    capacity: type === "shift" ? int(fd, "capacity", 1, 50) : null,
    animalId: uuid(fd, "animalId"),
    createdBy: user.id,
  }));
  const created = await db.insert(s.calendarEvents).values(rows).returning({ id: s.calendarEvents.id });
  await audit(user.id, "event.create", "event", created[0].id, { title, weeks: rows.length });
  redirect(`/calendar?m=${startOn.slice(0, 7)}&saved=1`);
}

async function loadOwnedEvent(id: string) {
  const user = await requirePermission("calendar:edit");
  const [event] = await db.select().from(s.calendarEvents).where(eq(s.calendarEvents.id, id));
  if (!event) redirect("/calendar");
  if (event.createdBy !== user.id && !can(user, "calendar:manage_all")) fail(`/calendar/${id}`, "denied");
  return { user, event };
}

export async function deleteEvent(id: string) {
  const { user, event } = await loadOwnedEvent(id);
  await db.delete(s.calendarEvents).where(eq(s.calendarEvents.id, id));
  await audit(user.id, "event.delete", "event", id, { title: event.title, startOn: event.startOn });
  redirect(`/calendar?m=${event.startOn.slice(0, 7)}`);
}

export async function signUpForShift(eventId: string) {
  const user = await requirePermission("calendar:edit");
  const to = `/calendar/${eventId}`;
  const full = await db.transaction(async (tx) => {
    // Lock the event row so two people can't take the last place at the same moment.
    const [event] = await tx.select().from(s.calendarEvents).where(eq(s.calendarEvents.id, eventId)).for("update");
    if (!event) return true;
    const [{ taken }] = await tx.select({ taken: count() }).from(s.shiftSignups).where(eq(s.shiftSignups.eventId, eventId));
    if (event.capacity !== null && taken >= event.capacity) return true;
    await tx.insert(s.shiftSignups).values({ eventId, userId: user.id }).onConflictDoNothing();
    return false;
  });
  if (full) fail(to, "shift_full");
  await audit(user.id, "shift.signup", "event", eventId);
  redirect(to);
}

export async function withdrawFromShift(eventId: string) {
  const user = await requirePermission("calendar:edit");
  await db.delete(s.shiftSignups).where(and(eq(s.shiftSignups.eventId, eventId), eq(s.shiftSignups.userId, user.id)));
  await audit(user.id, "shift.withdraw", "event", eventId);
  redirect(`/calendar/${eventId}`);
}

// ---- Adoption and visibility cases ----------------------------------------------
function adoptionFields(fd: FormData) {
  return {
    animalName: text(fd, "animalName", MAX_NAME) ?? "",
    adopterName: text(fd, "adopterName", MAX_NAME),
    stage: oneOf(fd, "stage", s.adoptionStageEnum.enumValues, "paperwork"),
    healthBook: text(fd, "healthBook"),
    contractNo: text(fd, "contractNo"),
    vaccine: text(fd, "vaccine"),
    microchip: text(fd, "microchip"),
    passport: text(fd, "passport"),
    notes: text(fd, "notes"),
    statusNote: text(fd, "statusNote"),
    nextStepOn: date(fd, "nextStepOn"),
  };
}

/** The one living person with exactly this name, ignoring case. None when there are several or none. */
async function personNamed(name: string | null) {
  if (!name) return null;
  const rows = await db.select({ id: s.people.id }).from(s.people)
    .where(and(isNull(s.people.erasedAt), sql`lower(${s.people.name}) = lower(${name})`)).limit(2);
  return rows.length === 1 ? rows[0].id : null;
}
async function animalNamed(name: string) {
  const rows = await db.select({ id: s.animals.id }).from(s.animals).where(sql`lower(${s.animals.name}) = lower(${name})`).limit(2);
  return rows.length === 1 ? rows[0].id : null;
}
const sameName = (a: string | null, b: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

export async function saveAdoption(id: string | null, fd: FormData) {
  const user = await requirePermission("adoptions:edit");
  const fields = adoptionFields(fd);
  if (!fields.animalName) fail("/adoptions", "invalid");
  if (id) {
    if (!isUuid(id)) fail("/adoptions", "invalid");
    const [before] = await db.select().from(s.adoptionCases).where(eq(s.adoptionCases.id, id));
    if (!before) fail("/adoptions", "invalid");
    // A case is linked to a person and a cat. A changed name means a different one, so the old link
    // must not stay: a data export or erasure of the old person would reach this case.
    await db.update(s.adoptionCases).set({
      ...fields,
      personId: sameName(before.adopterName, fields.adopterName) ? before.personId : await personNamed(fields.adopterName),
      animalId: sameName(before.animalName, fields.animalName) ? before.animalId : await animalNamed(fields.animalName),
      updatedAt: new Date(),
    }).where(eq(s.adoptionCases.id, id));
  } else {
    await db.insert(s.adoptionCases).values({ ...fields, personId: await personNamed(fields.adopterName), animalId: await animalNamed(fields.animalName) });
  }
  await audit(user.id, id ? "adoption.update" : "adoption.create", "adoption", id, { animal: fields.animalName, stage: fields.stage });
  saved("/adoptions");
}

function visibilityFields(fd: FormData) {
  return {
    contactName: text(fd, "contactName"),
    animalName: text(fd, "animalName", MAX_NAME) ?? "",
    photosRef: text(fd, "photosRef"),
    contractReceived: text(fd, "contractReceived"),
    readyForSite: text(fd, "readyForSite"),
    onSite: text(fd, "onSite"),
    interestedPerson: text(fd, "interestedPerson"),
    details: text(fd, "details"),
    infoSheet: text(fd, "infoSheet"),
    description: text(fd, "description"),
    extra: text(fd, "extra"),
  };
}

export async function saveVisibility(id: string | null, fd: FormData) {
  const user = await requirePermission("visibility:edit");
  const fields = visibilityFields(fd);
  if (!fields.animalName) fail("/visibility", "invalid");
  if (id) await db.update(s.visibilityCases).set({ ...fields, updatedAt: new Date() }).where(eq(s.visibilityCases.id, id));
  else await db.insert(s.visibilityCases).values(fields);
  await audit(user.id, id ? "visibility.update" : "visibility.create", "visibility", id, { animal: fields.animalName });
  saved("/visibility");
}

// ---- Review queue ---------------------------------------------------------------
export async function resolveIssue(id: string) {
  const user = await requirePermission("review:manage");
  await db.update(s.importIssues).set({ resolved: true }).where(eq(s.importIssues.id, id));
  await audit(user.id, "issue.resolve", "issue", id);
  redirect("/review");
}

export async function assignPhoto(photoId: string, fd: FormData) {
  const user = await requirePermission("review:manage");
  const animalId = uuid(fd, "animalId");
  if (!animalId) fail("/review", "invalid");
  await db.update(s.photos).set({ animalId }).where(eq(s.photos.id, photoId));
  await audit(user.id, "photo.assign", "animal", animalId);
  redirect("/review");
}

// ---- Users ----------------------------------------------------------------------
const ROLES = s.roleEnum.enumValues;

export async function createUser(fd: FormData) {
  const admin = await requirePermission("users:manage");
  const email = (text(fd, "email", MAX_NAME) ?? "").toLowerCase();
  const name = text(fd, "name", MAX_NAME);
  const password = text(fd, "password") ?? "";
  if (!email.includes("@") || !name) fail("/admin/users", "invalid");
  if (password.length < MIN_PASSWORD) fail("/admin/users", "password_short");
  if (password.length > MAX_PASSWORD) fail("/admin/users", "password_long");
  const [taken] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email));
  if (taken) fail("/admin/users", "email_taken");
  const [row] = await db
    .insert(s.users)
    .values({
      email,
      name: name!,
      passwordHash: await hashPassword(password),
      role: oneOf(fd, "role", ROLES, "volunteer"),
      ownsAdoptions: fd.get("ownsAdoptions") === "on",
      ownsVisibility: fd.get("ownsVisibility") === "on",
    })
    .returning({ id: s.users.id });
  await audit(admin.id, "user.create", "user", row.id, { email });
  saved("/admin/users");
}

export async function updateUser(id: string, fd: FormData) {
  const admin = await requirePermission("users:manage");
  const role = oneOf(fd, "role", ROLES, "volunteer");
  const active = fd.get("active") === "on";
  if (role !== "admin" || !active) {
    const [{ others }] = await db
      .select({ others: count() })
      .from(s.users)
      .where(and(eq(s.users.role, "admin"), eq(s.users.active, true), ne(s.users.id, id)));
    if (others === 0) fail("/admin/users", "last_admin");
  }
  const password = text(fd, "password");
  if (password && password.length < MIN_PASSWORD) fail("/admin/users", "password_short");
  if (password && password.length > MAX_PASSWORD) fail("/admin/users", "password_long");
  await db
    .update(s.users)
    .set({
      role,
      active,
      ownsAdoptions: fd.get("ownsAdoptions") === "on",
      ownsVisibility: fd.get("ownsVisibility") === "on",
      ...(password ? { passwordHash: await hashPassword(password), mustChangePassword: true } : {}),
    })
    .where(eq(s.users.id, id));
  if (password || !active) await db.delete(s.sessions).where(eq(s.sessions.userId, id));
  await audit(admin.id, "user.update", "user", id, { role, active, passwordReset: Boolean(password) });
  saved("/admin/users");
}

/** Removes an account for good. Their records stay, without a name attached. */
export async function deleteUser(id: string) {
  const admin = await requirePermission("users:manage");
  if (!isUuid(id) || id === admin.id) fail("/admin/users", "invalid");
  const [target] = await db.select({ role: s.users.role, active: s.users.active }).from(s.users).where(eq(s.users.id, id));
  if (!target) redirect("/admin/users");
  await db.delete(s.users).where(eq(s.users.id, id));
  // The address is left out, so the log doesn't keep what was just removed.
  await audit(admin.id, "user.delete", "user", id, { role: target.role });
  saved("/admin/users");
}

// ---- Lists: products and clinics ------------------------------------------------
const LISTS = "/admin/lists";
const MAX_INTERVAL_DAYS = 730;

/** The spellings a product or clinic is recognised by: its name, plus what was typed. */
function aliasesFrom(fd: FormData, name: string) {
  const typed = parseAliases(text(fd, "aliases")).map((alias) => alias.slice(0, 80)).slice(0, MAX_ALIASES);
  return [...new Set([normalizeTerm(name), ...typed])].filter(Boolean);
}

export async function saveProduct(id: string | null, fd: FormData) {
  const user = await requirePermission("lists:manage");
  if (id && !isUuid(id)) fail(LISTS, "invalid");
  const name = text(fd, "name")?.slice(0, 80) ?? "";
  const kinds = fd.getAll("kinds").filter((k): k is (typeof PRODUCT_KINDS)[number] => (PRODUCT_KINDS as readonly string[]).includes(String(k)));
  const intervalDays = text(fd, "intervalDays") ? int(fd, "intervalDays", 1, MAX_INTERVAL_DAYS) : null;
  if (!name || kinds.length === 0 || (text(fd, "intervalDays") && intervalDays === null)) fail(LISTS, "invalid");
  const aliases = aliasesFrom(fd, name);
  const [sameName] = await db.select({ id: s.products.id }).from(s.products).where(sql`lower(${s.products.name}) = lower(${name})`);
  if (sameName && sameName.id !== id) fail(LISTS, "name_taken");
  const taken = await db.select({ alias: s.productAliases.alias, productId: s.productAliases.productId }).from(s.productAliases).where(inArray(s.productAliases.alias, aliases));
  if (taken.some((a) => a.productId !== id)) fail(LISTS, "alias_taken");
  const report = await db.transaction(async (tx) => {
    let productId = id;
    if (id) {
      await tx.update(s.products).set({ name, kinds, intervalDays, active: fd.get("active") === "on" }).where(eq(s.products.id, id));
      await tx.delete(s.productAliases).where(eq(s.productAliases.productId, id));
    } else {
      [{ id: productId }] = await tx.insert(s.products).values({ name, kinds, intervalDays }).returning({ id: s.products.id });
    }
    await tx.insert(s.productAliases).values(aliases.map((alias) => ({ alias, productId: productId! })));
    // Notes already naming this product get linked to it. Their text is left as it is.
    return { productId, link: await linkMedicalRecords(tx, { clearDescriptions: false }) };
  });
  await audit(user.id, id ? "product.update" : "product.create", "product", report.productId, { name, kinds, intervalDays, aliases, linked: report.link.productsLinked });
  saved(LISTS);
}

/** Moves every record and spelling of one product to another, then removes the first. For duplicates. */
export async function mergeProduct(sourceId: string, fd: FormData) {
  const user = await requirePermission("lists:manage");
  const targetId = uuid(fd, "targetId");
  if (!isUuid(sourceId) || !targetId || targetId === sourceId) fail(LISTS, "invalid");
  const [source] = await db.select().from(s.products).where(eq(s.products.id, sourceId));
  const [target] = await db.select().from(s.products).where(eq(s.products.id, targetId!));
  if (!source || !target) fail(LISTS, "invalid");
  await db.transaction(async (tx) => {
    await tx.update(s.medicalRecords).set({ productId: target.id }).where(eq(s.medicalRecords.productId, source.id));
    await tx.update(s.productAliases).set({ productId: target.id }).where(eq(s.productAliases.productId, source.id));
    // The records keep fitting their product: it now covers the types of both.
    await tx.update(s.products).set({ kinds: [...new Set([...target.kinds, ...source.kinds])] }).where(eq(s.products.id, target.id));
    await tx.delete(s.products).where(eq(s.products.id, source.id));
  });
  await audit(user.id, "product.merge", "product", target.id, { from: source.name, into: target.name });
  saved(LISTS);
}

export async function saveClinic(id: string | null, fd: FormData) {
  const user = await requirePermission("lists:manage");
  if (id && !isUuid(id)) fail(LISTS, "invalid");
  const name = text(fd, "name")?.slice(0, 80) ?? "";
  if (!name) fail(LISTS, "invalid");
  const aliases = aliasesFrom(fd, name);
  const [sameName] = await db.select({ id: s.clinics.id }).from(s.clinics).where(sql`lower(${s.clinics.name}) = lower(${name})`);
  if (sameName && sameName.id !== id) fail(LISTS, "name_taken");
  const taken = await db.select({ clinicId: s.clinicAliases.clinicId }).from(s.clinicAliases).where(inArray(s.clinicAliases.alias, aliases));
  if (taken.some((a) => a.clinicId !== id)) fail(LISTS, "alias_taken");
  const clinicId = await db.transaction(async (tx) => {
    let clinicId = id;
    if (id) {
      await tx.update(s.clinics).set({ name, active: fd.get("active") === "on" }).where(eq(s.clinics.id, id));
      await tx.delete(s.clinicAliases).where(eq(s.clinicAliases.clinicId, id));
    } else {
      [{ id: clinicId }] = await tx.insert(s.clinics).values({ name }).returning({ id: s.clinics.id });
    }
    await tx.insert(s.clinicAliases).values(aliases.map((alias) => ({ alias, clinicId: clinicId! })));
    await linkMedicalRecords(tx, { clearDescriptions: false });
    return clinicId;
  });
  await audit(user.id, id ? "clinic.update" : "clinic.create", "clinic", clinicId, { name, aliases });
  saved(LISTS);
}

export async function mergeClinic(sourceId: string, fd: FormData) {
  const user = await requirePermission("lists:manage");
  const targetId = uuid(fd, "targetId");
  if (!isUuid(sourceId) || !targetId || targetId === sourceId) fail(LISTS, "invalid");
  const [source] = await db.select().from(s.clinics).where(eq(s.clinics.id, sourceId));
  const [target] = await db.select().from(s.clinics).where(eq(s.clinics.id, targetId!));
  if (!source || !target) fail(LISTS, "invalid");
  await db.transaction(async (tx) => {
    await tx.update(s.medicalRecords).set({ clinicId: target.id }).where(eq(s.medicalRecords.clinicId, source.id));
    await tx.update(s.clinicAliases).set({ clinicId: target.id }).where(eq(s.clinicAliases.clinicId, source.id));
    await tx.delete(s.clinics).where(eq(s.clinics.id, source.id));
  });
  await audit(user.id, "clinic.merge", "clinic", target.id, { from: source.name, into: target.name });
  saved(LISTS);
}

// ---- Lists: shelter locations ---------------------------------------------------
export async function saveLocation(id: string | null, fd: FormData) {
  const user = await requirePermission("lists:manage");
  if (id && !isUuid(id)) fail(LISTS, "invalid");
  const name = text(fd, "name")?.slice(0, 80) ?? "";
  if (!name) fail(LISTS, "invalid");
  const [sameName] = await db.select({ id: s.locations.id }).from(s.locations).where(sql`lower(${s.locations.name}) = lower(${name})`);
  if (sameName && sameName.id !== id) fail(LISTS, "name_taken");
  let locationId = id;
  if (id) {
    const [row] = await db.update(s.locations).set({ name, active: fd.get("active") === "on" }).where(eq(s.locations.id, id)).returning({ id: s.locations.id });
    if (!row) fail(LISTS, "invalid");
  } else {
    [{ id: locationId }] = await db.insert(s.locations).values({ name }).returning({ id: s.locations.id });
  }
  await audit(user.id, id ? "location.update" : "location.create", "location", locationId, { name, active: id ? fd.get("active") === "on" : true });
  saved(LISTS);
}

/** Moves every animal at one location to another, then removes the first. For duplicates. */
export async function mergeLocation(sourceId: string, fd: FormData) {
  const user = await requirePermission("lists:manage");
  const targetId = uuid(fd, "targetId");
  if (!isUuid(sourceId) || !targetId || targetId === sourceId) fail(LISTS, "invalid");
  const [source] = await db.select().from(s.locations).where(eq(s.locations.id, sourceId));
  const [target] = await db.select().from(s.locations).where(eq(s.locations.id, targetId!));
  if (!source || !target) fail(LISTS, "invalid");
  const moved = await db.transaction(async (tx) => {
    const rows = await tx.update(s.animals).set({ locationId: target.id, updatedAt: new Date() }).where(eq(s.animals.locationId, source.id)).returning({ id: s.animals.id });
    await tx.delete(s.locations).where(eq(s.locations.id, source.id));
    return rows.length;
  });
  await audit(user.id, "location.merge", "location", target.id, { from: source.name, into: target.name, animals: moved });
  saved(LISTS);
}
