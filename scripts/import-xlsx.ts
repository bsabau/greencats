/**
 * Loads the Green Cats workbook into the database.
 *
 *   npm run import -- /path/to/inventar.xlsx [--replace]
 *
 * Nothing is silently dropped: original wording is stored beside parsed values,
 * and anything uncertain becomes a row on the app's Review page.
 * --replace wipes shelter data first (user accounts are kept). It asks to type the number of animals
 * that will be erased; --yes-erase-shelter-data skips the question, for scripts.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { db, pg, schema as s } from "../src/db";
import { parseCellDate, parseDayMonth, splitEntries, extractDate, fold, type CellValue, type FuzzyDate } from "../src/lib/dates";
import { nextDue, type MedicalKind } from "../src/lib/medical-schedule";
import { cleanPhoto } from "../src/lib/photos";
import { phonesIn, stripPhones } from "../src/lib/permissions";
import { linkMedicalRecords, recalculateDueDates, seedCatalog } from "../src/lib/catalog";
import { ensureLocations, type SeedLocation } from "../src/lib/locations";
import {
  containsPhone,
  nameKey,
  normalizePhone,
  parseDeathEntry,
  parsePhones,
  splitAnimalList,
  splitAnimalName,
  testResult,
} from "../src/lib/import-helpers";

type Status = (typeof s.animalStatusEnum.enumValues)[number];
type PlacementKind = (typeof s.placementKindEnum.enumValues)[number];
type Rating = (typeof s.fosterRatingEnum.enumValues)[number];

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const replace = args.includes("--replace");
if (!file) throw new Error("Usage: npm run import -- <file.xlsx> [--replace]");
const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";

// Replacing erases everything entered in the app since the last import, so it is confirmed first.
if (replace) {
  const [{ existing }] = await db.select({ existing: sql<number>`count(*)::int` }).from(s.animals);
  if (existing > 0 && !args.includes("--yes-erase-shelter-data")) {
    const warning =
      `--replace erases all ${existing} animals, people, medical records, cases, events and photos entered in the app.\n` +
      "Take a backup first: docker compose run --rm backup once";
    let confirmed = false;
    if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      confirmed = (await rl.question(`${warning}\nType ${existing} to continue: `)).trim() === String(existing);
      rl.close();
    } else {
      console.error(`${warning}\nRun it in a terminal to confirm, or add --yes-erase-shelter-data.`);
    }
    if (!confirmed) {
      console.error("Nothing was changed.");
      await pg.end();
      process.exit(1);
    }
  }
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const sheet = (name: string) => {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`Missing sheet: ${name}`);
  return ws;
};

function val(ws: ExcelJS.Worksheet, r: number, c: number): CellValue {
  const v = ws.getCell(r, c).value as unknown;
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: unknown; error?: unknown };
    if (o.richText) return o.richText.map((t) => t.text).join("").trim() || null;
    if ("result" in o || "formula" in o) {
      return typeof o.result === "string" || typeof o.result === "number" || o.result instanceof Date ? o.result : null;
    }
    if (typeof o.text === "string") return o.text.trim() || null;
  }
  return null;
}
const str = (v: CellValue): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return typeof v === "number" ? String(Math.abs(v) >= 1e6 ? Math.trunc(v) : v) : v;
};
const fillOf = (ws: ExcelJS.Worksheet, r: number, c: number): string | null => {
  const fill = ws.getCell(r, c).fill as ExcelJS.FillPattern | undefined;
  return fill?.type === "pattern" ? (fill.fgColor?.argb ?? null) : null;
};

// ---- In-memory model -------------------------------------------------------
type Issue = { sheet: string; row: number | null; field: string | null; rawValue: string | null; message: string; animalId: string | null };
const issues: Issue[] = [];
const issue = (sheetName: string, row: number | null, field: string | null, raw: CellValue, message: string, animalId: string | null = null) =>
  issues.push({ sheet: sheetName, row, field, rawValue: str(raw), message, animalId });

// `place` is the workbook column an animal in the shelter was found in. It becomes locationId when written.
type Animal = typeof s.animals.$inferInsert & { id: string; aliases: string[]; fromSection: Status; place?: SeedLocation };
type Person = { id: string; name: string; phones: string[]; address: string | null; notes: string[]; fosterRating: Rating; externalCase: boolean };
type Medical = typeof s.medicalRecords.$inferInsert;
type Placement = { id: string; animalId: string; personId: string; kind: PlacementKind; startDate: string | null; startText: string | null; notes: string | null; open: boolean };

const animals: Animal[] = [];
const animalIndex = new Map<string, Animal[]>();
const indexAnimal = (a: Animal, label: string) => {
  const k = nameKey(label);
  if (k && !animalIndex.get(k)?.includes(a)) animalIndex.set(k, [...(animalIndex.get(k) ?? []), a]);
};
const ACTIVE: Status[] = ["in_shelter", "clinic", "foster", "foster_adoption", "adoption_incomplete"];

function findAnimal(name: string, sheetName: string, row: number): Animal | null {
  const matches = animalIndex.get(nameKey(name)) ?? [];
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const active = matches.filter((a) => ACTIVE.includes(a.status!));
  const pick = active.length >= 1 ? active[0] : matches[0];
  issue(sheetName, row, "Nume", name, `Mai multe animale cu acest nume (${matches.length}); am ales unul — verificati legatura.`, pick.id);
  return pick;
}
function createAnimal(name: string, status: Status, extra: Partial<Animal> = {}): Animal {
  const { name: display, aliases } = splitAnimalName(name);
  const a: Animal = { id: randomUUID(), name: display, aliases, status, fromSection: status, ...extra };
  animals.push(a);
  indexAnimal(a, display);
  aliases.forEach((alias) => indexAnimal(a, alias));
  return a;
}

const people: Person[] = [];
const peopleByName = new Map<string, Person>();
const peopleByPhone = new Map<string, Person>();
function upsertPerson(rawName: string, phones: string[] = [], address: string | null = null, note: string | null = null): Person {
  // A phone typed into the name cell would show to everyone who sees the name, so it moves to the phones.
  phones = [...phones, ...phonesIn(rawName).map(normalizePhone)];
  const name = stripPhones(rawName.split("\n")[0].replace(/\(?https?:\S*\)?/g, "")).replace(/\s+/g, " ").replace(/^:\s*/, "").trim();
  const key = nameKey(name);
  let p = peopleByName.get(key) ?? phones.map((ph) => peopleByPhone.get(ph)).find(Boolean);
  if (!p) {
    p = { id: randomUUID(), name, phones: [], address: null, notes: [], fosterRating: "unrated", externalCase: false };
    people.push(p);
  } else if (name.length > p.name.length) {
    p.name = name;
  }
  peopleByName.set(key, p);
  for (const ph of phones) {
    if (!p.phones.includes(ph)) p.phones.push(ph);
    peopleByPhone.set(ph, p);
  }
  if (address && !p.address) p.address = address.replace(/^[\s:]+/, "").replace(/\s+/g, " ").trim();
  if (note && !p.notes.includes(note)) p.notes.push(note);
  return p;
}

const placements: Placement[] = [];
function addPlacement(animal: Animal, person: Person, kind: PlacementKind, start: CellValue = null, notes: string | null = null, closed = false) {
  const existing = placements.find((p) => p.animalId === animal.id && p.personId === person.id);
  const parsed = parseCellDate(start);
  if (existing) {
    existing.startDate ??= parsed?.date ?? null;
    existing.startText ??= str(start);
    if (kind === "adoption" || existing.kind === "foster") existing.kind = kind;
    return existing;
  }
  const p: Placement = { id: randomUUID(), animalId: animal.id, personId: person.id, kind, startDate: parsed?.date ?? null, startText: str(start), notes, open: !closed };
  placements.push(p);
  return p;
}
function resolveCats(raw: string, sheetName: string, row: number): Animal[] {
  const whole = findAnimal(raw, sheetName, row);
  if (whole) return [whole];
  return splitAnimalList(raw).flatMap((part) => {
    const a = findAnimal(part, sheetName, row) ?? findAnimal(part.replace(/\s+\p{L}$/u, ""), sheetName, row);
    if (a) return [a];
    const viaSlash = part.split("/").map((x) => findAnimal(x, sheetName, row)).find(Boolean);
    return viaSlash ? [viaSlash] : [createUnmatched(part, sheetName, row)];
  });
}
function createUnmatched(name: string, sheetName: string, row: number): Animal {
  const a = createAnimal(name.replace(/\s+\p{L}$/u, ""), "unknown");
  issue(sheetName, row, "Nume", name, "Animalul nu apare in Info medicale; a fost creat din aceasta foaie, fara istoric medical.", a.id);
  return a;
}
function setStatus(a: Animal, status: Status, sheetName: string, row: number, place?: SeedLocation) {
  if (a.status === "deceased" && status !== "deceased") {
    issue(sheetName, row, "Statut", a.name, `Apare ca decedat in Info medicale, dar aici e activ (${status}). Am pastrat „decedat".`, a.id);
    return;
  }
  if (a.fromSection === "adopted" && ACTIVE.includes(status) && status !== "adoption_incomplete") {
    issue(sheetName, row, "Statut", a.name, `Apare ca adoptat in Info medicale, dar in Inventar e ${status}. Am folosit Inventarul.`, a.id);
  }
  a.status = status;
  a.place = place;
}

// ---- Info medicale: the primary list of animals ------------------------------
const medical: Medical[] = [];
function addMedical(a: Animal, kind: MedicalKind, cell: CellValue, row: number, column: string) {
  if (cell === null || cell === undefined) return;
  const isTest = kind.startsWith("test_");
  const entries: { text: string; date: FuzzyDate | null }[] =
    typeof cell === "string"
      ? splitEntries(cell).map((text) => ({ text, date: extractDate(text) }))
      : [{ text: str(cell) ?? "", date: parseCellDate(cell) }];
  for (const { text, date } of entries) {
    if (/^(nu|no|-|\?)$/i.test(text.trim())) continue;
    if (!date && !isTest && !/^(da|yes)$/i.test(text.trim())) {
      issue("Info medicale", row, column, text, "Nu am putut citi data; textul a fost pastrat fara data.", a.id);
    }
    const rest = date && "rest" in date ? (date as { rest: string }).rest : date ? "" : text;
    const birthForAge = a.birthPrecision === "year" ? null : (a.birthDate ?? null);
    medical.push({
      animalId: a.id,
      kind,
      date: date?.date ?? null,
      precision: date?.precision ?? null,
      description: rest || null,
      result: isTest ? testResult(text) : null,
      nextDueOn: date?.precision === "day" ? nextDue(kind, date.date, birthForAge) : null,
      rawText: text,
    });
  }
}

{
  const ws = sheet("Info medicale");
  let section: "green" | "financial" | "adopted" | "deceased" | "dogs" | null = null;
  for (let r = 3; r <= ws.rowCount; r++) {
    const rawName = str(val(ws, r, 2));
    if (!rawName) continue;
    if (!val(ws, r, 1)) {
      const heading = fold(rawName);
      const next =
        heading.startsWith("pisici green") ? "green"
        : heading.startsWith("ajutor financiar") ? "financial"
        : heading.startsWith("pisici adoptate") ? "adopted"
        : heading.startsWith("raiul pisicilor") ? "deceased"
        : heading === "catei" ? "dogs"
        : null;
      if (next) { section = next; continue; }
    }
    if (!section) continue;

    const contract = str(val(ws, r, 6));
    const c = fold(contract ?? "");
    const status: Status =
      section === "adopted" ? "adopted"
      : section === "deceased" ? "deceased"
      : section === "financial" ? "external"
      : section === "dogs" ? "unknown"
      : c.startsWith("foster cu") ? "foster_adoption"
      : c.startsWith("foster") ? "foster"
      : c.startsWith("casuta") || c.startsWith("ana") ? "in_shelter"
      : "unknown";
    const place: SeedLocation | undefined = status !== "in_shelter" ? undefined : c.startsWith("casuta") ? "casuta" : "ana_adi";

    const birthCell = val(ws, r, 3);
    const intakeCell = val(ws, r, 4);
    const birth = parseCellDate(birthCell);
    const intake = parseCellDate(intakeCell);
    const sexText = fold(str(val(ws, r, 10)) ?? "");
    const sterText = str(val(ws, r, 11));
    const sterFold = fold(sterText ?? "").trim();
    const sterDate = sterText ? extractDate(sterText) : null;
    // A phone typed into a name would show on every list, so it moves to the notes, where it stays hidden from volunteers.
    const hasPhone = containsPhone(rawName);
    const a = createAnimal(hasPhone ? stripPhones(rawName) : rawName, status, {
      place,
      species: section === "dogs" ? "dog" : "cat",
      color: str(val(ws, r, 5)),
      birthDate: birth?.date ?? null,
      birthPrecision: birth?.precision ?? null,
      birthText: str(birthCell),
      intakeDate: intake?.date ?? null,
      intakePrecision: intake?.precision ?? null,
      intakeText: str(intakeCell),
      contractText: contract,
      healthBookNo: str(val(ws, r, 7)),
      microchip: str(val(ws, r, 8)),
      passport: str(val(ws, r, 9)),
      sex: sexText.startsWith("f") ? "f" : sexText.startsWith("m") ? "m" : "unknown",
      sterilized: !sterText ? "unknown" : /^(nu|no)\b/.test(sterFold) ? "no" : "yes",
      sterilizedText: sterText,
      currentTreatment: str(val(ws, r, 14)),
      intakeHistory: str(val(ws, r, 21)),
      medicalSummary: str(val(ws, r, 22)),
      otherInfo: [str(val(ws, r, 23)), hasPhone ? rawName : null].filter(Boolean).join("\n") || null,
      refillNotes: str(val(ws, r, 24)),
    });
    if (birthCell && !birth) issue("Info medicale", r, "Data nasterii", birthCell, "Data nasterii nu a putut fi citita.", a.id);
    if (intakeCell && !intake) issue("Info medicale", r, "Data preluarii", intakeCell, "Data preluarii nu a putut fi citita.", a.id);
    if (status === "unknown" && section === "green") issue("Info medicale", r, "Contract", contract, "Locatia nu reiese din coloana Contract.", a.id);
    if (section === "dogs") issue("Info medicale", r, "Specie", rawName, "Randul e sub titlul CATEI; confirmati specia si statutul.", a.id);
    if (hasPhone) issue("Info medicale", r, "Nume", rawName, "Numele continea un numar de telefon; a fost mutat la Alte informatii. Legati-l de o persoana de contact.", a.id);
    if (a.sterilized === "yes" && sterDate) {
      medical.push({ animalId: a.id, kind: "sterilization", date: sterDate.date, precision: sterDate.precision, description: sterDate.rest || null, rawText: sterText });
    }
    addMedical(a, "deworm_external", val(ws, r, 12), r, "Dep externa");
    addMedical(a, "deworm_internal", val(ws, r, 13), r, "Dep interna");
    addMedical(a, "vaccine_polyvalent", val(ws, r, 15), r, "Polivalent");
    addMedical(a, "vaccine_rabies", val(ws, r, 16), r, "Antirabic");
    addMedical(a, "test_fiv_felv", val(ws, r, 17), r, "Fiv/FeLV");
    addMedical(a, "test_corona", val(ws, r, 18), r, "Corona");
    addMedical(a, "test_giardia", val(ws, r, 19), r, "Giardia");
    addMedical(a, "test_mange", val(ws, r, 20), r, "Raie");
  }
}

// ---- Inventar pisici: where each animal is right now -------------------------
{
  const name = "Inventar pisici";
  const ws = sheet(name);
  let inClinic = false;
  for (let r = 2; r <= ws.rowCount; r++) {
    if (fold(str(val(ws, r, 3)) ?? "") === "cabinet") inClinic = true;
    const casuta = str(val(ws, r, 4));
    if (casuta) resolveCats(casuta, name, r).forEach((a) => setStatus(a, inClinic ? "clinic" : "in_shelter", name, r, inClinic ? undefined : "casuta"));
    const anaAdi = str(val(ws, r, 8));
    if (anaAdi) resolveCats(anaAdi, name, r).forEach((a) => setStatus(a, "in_shelter", name, r, "ana_adi"));

    const fosterCats = str(val(ws, r, 12));
    const fosterName = str(val(ws, r, 11));
    if (fosterCats) {
      const note = str(val(ws, r, 13));
      for (const a of resolveCats(fosterCats, name, r)) {
        setStatus(a, "foster", name, r);
        if (note) a.locationNote = note;
        if (fosterName) addPlacement(a, upsertPerson(fosterName), "foster");
      }
    }
    const incompleteCats = str(val(ws, r, 16));
    const incompleteName = str(val(ws, r, 15));
    if (incompleteCats) {
      for (const a of resolveCats(incompleteCats, name, r)) {
        setStatus(a, "adoption_incomplete", name, r);
        if (incompleteName) addPlacement(a, upsertPerson(incompleteName), "adoption_incomplete").kind = "adoption_incomplete";
      }
    }
    const adoptedCats = str(val(ws, r, 21));
    const adoptedName = str(val(ws, r, 20));
    if (adoptedCats) {
      for (const a of resolveCats(adoptedCats, name, r)) {
        setStatus(a, "adopted", name, r);
        if (adoptedName) addPlacement(a, upsertPerson(adoptedName), "adoption");
      }
    }
    const heaven = str(val(ws, r, 25));
    if (heaven) {
      const entry = parseDeathEntry(heaven);
      const a = findAnimal(entry.name, name, r)
        ?? findAnimal(entry.name.split(" ")[0], name, r)
        ?? createAnimal(entry.name, "deceased");
      a.status = "deceased";
      a.deathDate ??= entry.date?.date ?? null;
      a.deathNote = [a.deathNote, heaven].filter(Boolean).join(" | ");
    }
  }
}

// ---- Contacts ----------------------------------------------------------------
{
  const name = "Contacte FosterAdoptatori";
  const ws = sheet(name);
  for (let r = 2; r <= ws.rowCount; r++) {
    const personName = str(val(ws, r, 2));
    if (!personName) continue;
    const cats = str(val(ws, r, 3));
    const statusText = fold(str(val(ws, r, 4)) ?? "");
    const fill = fillOf(ws, r, 2);
    const extra = str(val(ws, r, 8));
    const person = upsertPerson(personName, parsePhones(val(ws, r, 5)), str(val(ws, r, 6)), extra);
    if (fill === "FFFF00FF") person.externalCase = true;
    if (!cats) continue;
    const kind: PlacementKind =
      statusText.startsWith("adoptie") ? "adoption"
      : statusText.startsWith("foster cu") ? "foster_adoption"
      : "foster";
    if (statusText === "adoptie & foster") issue(name, r, "Status", statusText, "Status mixt adoptie & foster; am inregistrat adoptie.");
    const dateCell = val(ws, r, 7);
    if (dateCell && !parseCellDate(dateCell)) issue(name, r, "Data plasare", dateCell, "Data plasarii nu a putut fi citita.");
    for (const a of resolveCats(cats, name, r)) {
      addPlacement(a, person, kind, dateCell, fill === "FFFFF2CC" ? "mutat provizoriu" : null);
      if (kind === "foster_adoption" && a.status === "foster") a.status = "foster_adoption";
    }
  }
}
{
  const name = "Contacte ex Foster";
  const ws = sheet(name);
  const ratings: Record<string, Rating> = { FFD9EAD3: "ok", FFF4CCCC: "not_ok", FFFFF2CC: "conditional" };
  for (let r = 4; r <= ws.rowCount; r++) {
    const personName = str(val(ws, r, 2));
    if (personName) {
      const person = upsertPerson(personName, parsePhones(val(ws, r, 4)), str(val(ws, r, 5)), str(val(ws, r, 6)));
      const rating = ratings[fillOf(ws, r, 2) ?? ""];
      if (rating) person.fosterRating = rating;
      const cats = str(val(ws, r, 3));
      if (cats) resolveCats(cats, name, r).forEach((a) => addPlacement(a, person, "foster", null, null, true));
    }
    const otherPerson = str(val(ws, r, 11));
    if (otherPerson) upsertPerson(otherPerson, [], null, str(val(ws, r, 12))).externalCase = true;
  }
}

// Cats missing from Info medicale can still be placed from their current contact row.
const peopleById = new Map(people.map((p) => [p.id, p]));
for (const a of animals.filter((x) => x.status === "unknown")) {
  const current = placements.filter((p) => p.animalId === a.id && p.open);
  const best = current.find((p) => p.kind === "adoption") ?? current.find((p) => p.kind === "foster_adoption") ?? current[0];
  if (!best) continue;
  a.status =
    best.kind === "adoption" ? "adopted"
    : peopleById.get(best.personId)?.externalCase ? "external"
    : best.kind;
}

// A placement is current only while the animal's status still matches it.
const STATUS_FOR: Record<PlacementKind, Status[]> = {
  foster: ["foster", "foster_adoption"],
  foster_adoption: ["foster", "foster_adoption"],
  adoption_incomplete: ["adoption_incomplete"],
  adoption: ["adopted"],
};
for (const p of placements) {
  const a = animals.find((x) => x.id === p.animalId)!;
  if (!STATUS_FOR[p.kind].includes(a.status!)) p.open = false;
}

// ---- Foster holidays -----------------------------------------------------------
const events: (typeof s.calendarEvents.$inferInsert)[] = [];
{
  const name = "Vacanta";
  const ws = sheet(name);
  const year = Number(/\d{4}/.exec(str(val(ws, 1, 1)) ?? "")?.[0] ?? new Date().getFullYear());
  // The table ends at its first blank row. Colour legends and term dates sit below it.
  for (let r = 3; r <= ws.rowCount; r++) {
    const personName = str(val(ws, r, 2));
    if (!personName) {
      if (!val(ws, r, 1)) break;
      continue;
    }
    const person = upsertPerson(personName, parsePhones(val(ws, r, 6)), str(val(ws, r, 7)));
    const cats = str(val(ws, r, 3));
    const leave = val(ws, r, 4);
    const back = val(ws, r, 5);
    const leaveOn = parseDayMonth(leave, year);
    let backOn = parseDayMonth(back, year);
    if (leave && !leaveOn) issue(name, r, "Data plecare", leave, "Plecarea nu a putut fi citita.");
    if (back && !backOn) issue(name, r, "Data intoarcere", back, "Intoarcerea nu a putut fi citita.");
    if (leaveOn && backOn && backOn < leaveOn) {
      issue(name, r, "Data intoarcere", back, "Intoarcerea e inaintea plecarii; a fost ignorata.");
      backOn = null;
    }
    const startOn = leaveOn ?? backOn;
    if (!startOn) continue;
    events.push({
      type: "foster_logistics",
      title: cats ? `${person.name}: ${cats}` : person.name,
      startOn,
      endOn: leaveOn ? backOn : null,
      notes: [leaveOn ? null : "Doar data intoarcerii e cunoscuta.", str(val(ws, r, 8)), str(val(ws, r, 9))].filter(Boolean).join("\n") || null,
      personId: person.id,
    });
  }
}

// ---- Adoption paperwork and visibility cases ------------------------------------
const adoptionRows: (typeof s.adoptionCases.$inferInsert)[] = [];
{
  const name = "Adoptii todo";
  const ws = sheet(name);
  let stage: "paperwork" | "to_verify" | "external" = "paperwork";
  for (let r = 2; r <= ws.rowCount; r++) {
    const cat = str(val(ws, r, 1));
    if (!cat) continue;
    const heading = fold(cat);
    if (heading.startsWith("de verificat")) { stage = "to_verify"; continue; }
    if (heading.startsWith("cazuri externe")) { stage = "external"; continue; }
    const adopter = str(val(ws, r, 2));
    const first = splitAnimalList(cat)[0];
    adoptionRows.push({
      animalId: (first && findAnimal(first, name, r)?.id) || null,
      animalName: cat,
      adopterName: adopter,
      personId: adopter ? upsertPerson(adopter).id : null,
      stage,
      healthBook: str(val(ws, r, 3)),
      contractNo: str(val(ws, r, 4)),
      vaccine: str(val(ws, r, 5)),
      microchip: str(val(ws, r, 6)),
      passport: str(val(ws, r, 7)),
      notes: str(val(ws, r, 8)),
      statusNote: str(val(ws, r, 9)),
    });
  }
}
const visibilityRows: (typeof s.visibilityCases.$inferInsert)[] = [];
{
  const ws = sheet("Susținere prin vizibilitate");
  for (let r = 2; r <= ws.rowCount; r++) {
    const contact = str(val(ws, r, 1));
    const cat = str(val(ws, r, 2));
    if (!contact && !cat) continue;
    visibilityRows.push({
      contactName: contact?.trim() ?? null,
      animalName: cat ?? contact!,
      photosRef: str(val(ws, r, 3)),
      contractReceived: str(val(ws, r, 4)),
      readyForSite: str(val(ws, r, 5)),
      onSite: str(val(ws, r, 6)),
      interestedPerson: str(val(ws, r, 7)),
      details: str(val(ws, r, 8)),
      infoSheet: str(val(ws, r, 9)),
      description: str(val(ws, r, 10)),
      extra: str(val(ws, r, 11)),
    });
  }
}

// ---- Cat heaven notes and the old hidden list ------------------------------------
{
  const name = "Cat heaven";
  const ws = sheet(name);
  let current: Animal | null = null;
  for (let r = 1; r <= ws.rowCount; r++) {
    const label = fold(str(val(ws, r, 6)) ?? "");
    const value = val(ws, r, 7);
    if (label === "nume" && value) {
      const n = str(value)!;
      current = findAnimal(n, name, r) ?? findAnimal(n.split(" ")[0], name, r) ?? createAnimal(n, "deceased");
      current.status = "deceased";
    } else if (current && label && value) {
      if (label === "cat heaven") current.deathDate ??= parseCellDate(value)?.date ?? null;
      else current.otherInfo = [current.otherInfo, `${str(val(ws, r, 6))}: ${str(value)}`].filter(Boolean).join("\n");
    }
  }
}
{
  const name = "Toate pisicile";
  const ws = sheet(name);
  for (let r = 2; r <= ws.rowCount; r++) {
    const cat = str(val(ws, r, 2));
    if (!cat) continue;
    const a = animalIndex.get(nameKey(cat))?.[0];
    if (!a) {
      issue(name, r, "Nume", cat, "Apare doar in lista veche ascunsa; nu a fost importat.");
      continue;
    }
    if (!a.intakeDate) {
      const cell = val(ws, r, 3);
      const parsed = parseCellDate(cell);
      if (parsed) { a.intakeDate = parsed.date; a.intakePrecision = parsed.precision; a.intakeText = str(cell); }
    }
  }
}

// ---- "La casuta" profile cards and their photos ------------------------------------
const photos: (typeof s.photos.$inferInsert)[] = [];
const photoFiles: { fileName: string; buffer: Buffer }[] = [];
{
  const name = "La casuta";
  const ws = sheet(name);
  const cards: { row: number; animal: Animal | null }[] = [];
  let card: { row: number; fields: Record<string, string>; rawName: string | null } | null = null;
  const flush = () => {
    if (!card) return;
    let animal: Animal | null = null;
    if (card.rawName) {
      animal = findAnimal(card.rawName, name, card.row);
      if (animal) animal.profile = card.fields;
      else issue(name, card.row, "Name", card.rawName, "Fisa de profil nu se potriveste cu niciun animal.");
    } else if (Object.keys(card.fields).length > 0) {
      issue(name, card.row, "Name", JSON.stringify(card.fields), "Fisa de profil nu are nume; alegeti animalul pe baza pozei.");
    }
    cards.push({ row: card.row, animal });
  };
  for (let r = 1; r <= ws.rowCount; r++) {
    const label = str(val(ws, r, 5));
    if (!label) continue;
    const value = str(val(ws, r, 6));
    if (label === "Name") {
      flush();
      card = { row: r, fields: {}, rawName: value };
    } else if (card && value) {
      card.fields[label] = value;
    }
  }
  flush();

  const heavenCards: typeof cards = [];
  const heaven = sheet("Cat heaven");
  for (let r = 1; r <= heaven.rowCount; r++) {
    if (fold(str(val(heaven, r, 6)) ?? "") !== "nume") continue;
    const n = str(val(heaven, r, 7));
    heavenCards.push({ row: r, animal: n ? (animalIndex.get(nameKey(n))?.[0] ?? animalIndex.get(nameKey(n.split(" ")[0]))?.[0] ?? null) : null });
  }

  for (const ws2 of wb.worksheets) {
    const sheetCards = ws2.name === name ? cards : ws2.name === "Cat heaven" ? heavenCards : [];
    for (const image of ws2.getImages()) {
      const media = wb.getImage(Number(image.imageId));
      if (!media?.buffer) continue;
      const anchorRow = (image.range.tl.nativeRow ?? 0) + 1;
      // Re-encoded like an uploaded photo: what a phone embeds goes, and the type is the real one.
      const clean = await cleanPhoto(Buffer.from(media.buffer as unknown as ArrayBuffer));
      if (!clean) {
        issue(ws2.name, anchorRow, "Poza", null, "Poza nu a putut fi citita si nu a fost importata.");
        continue;
      }
      const fileName = `${randomUUID()}.${clean.ext}`;
      // A photo sits next to its card. Anything further away stays unassigned for a person to place.
      const owner =
        image.range.tl.nativeCol === 0
          ? sheetCards
              .filter((c) => c.row >= anchorRow - 2 && c.row <= anchorRow + 6)
              .sort((a, b) => Math.abs(a.row - anchorRow) - Math.abs(b.row - anchorRow))[0]
          : undefined;
      photoFiles.push({ fileName, buffer: clean.buffer });
      photos.push({
        animalId: owner?.animal?.id ?? null,
        fileName,
        contentType: clean.type,
        importNote: `${ws2.name}, rand ${anchorRow}`,
      });
    }
  }
}

// ---- Write everything in one transaction ---------------------------------------
const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(s.animals);
if (count > 0 && !replace) throw new Error(`Database already has ${count} animals. Re-run with --replace to wipe shelter data first.`);

const chunks = <T,>(xs: T[], size = 500) =>
  Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, (i + 1) * size));

let catalog: Awaited<ReturnType<typeof linkMedicalRecords>> | undefined;
await db.transaction(async (tx) => {
  if (replace) {
    await tx.execute(sql`truncate animals, people, placements, medical_records, adoption_cases, visibility_cases, calendar_events, shift_signups, photos, import_issues cascade`);
  }
  // Locations are kept across a re-import, like products and clinics. Only animals still in the shelter keep their place.
  const locationIds = await ensureLocations(tx);
  for (const c of chunks(animals)) {
    await tx.insert(s.animals).values(c.map(({ fromSection: _, place, ...a }) => ({
      ...a, locationId: a.status === "in_shelter" && place ? locationIds[place] : null,
    })));
  }
  for (const c of chunks(people)) {
    await tx.insert(s.people).values(c.map(({ notes, ...p }) => ({ ...p, notes: notes.join("\n") || null })));
  }
  for (const c of chunks(placements)) await tx.insert(s.placements).values(c);
  for (const c of chunks(medical)) await tx.insert(s.medicalRecords).values(c);
  if (adoptionRows.length) await tx.insert(s.adoptionCases).values(adoptionRows);
  if (visibilityRows.length) await tx.insert(s.visibilityCases).values(visibilityRows);
  if (events.length) await tx.insert(s.calendarEvents).values(events);
  if (photos.length) await tx.insert(s.photos).values(photos);
  for (const c of chunks(issues)) await tx.insert(s.importIssues).values(c);
  // Products and clinics are kept across a re-import, so notes are linked to the lists the team built.
  await seedCatalog(tx);
  catalog = await linkMedicalRecords(tx, { clearDescriptions: true });
  await recalculateDueDates(tx);
});

await mkdir(uploadDir, { recursive: true });
for (const f of photoFiles) await writeFile(path.join(uploadDir, f.fileName), f.buffer);
if (replace) {
  // The old photos' rows were erased with the rest, so their files would stay on disk forever.
  const kept = new Set((await db.select({ fileName: s.photos.fileName }).from(s.photos)).map((p) => p.fileName));
  let removed = 0;
  for (const name of await readdir(uploadDir)) {
    if (kept.has(name) || name.startsWith(".")) continue;
    await unlink(path.join(uploadDir, name));
    removed += 1;
  }
  if (removed) console.log(`Removed ${removed} photo files of the replaced data.`);
}

const byStatus = animals.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.status!]: (acc[a.status!] ?? 0) + 1 }), {});
console.log(JSON.stringify({
  animals: animals.length, byStatus,
  inShelterByPlace: animals.filter((a) => a.status === "in_shelter").reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.place ?? "none"]: (acc[a.place ?? "none"] ?? 0) + 1 }), {}),
  people: people.length, placements: placements.length,
  openPlacements: placements.filter((p) => p.open).length, medical: medical.length,
  medicalWithDueDate: medical.filter((m) => m.nextDueOn).length, adoptionCases: adoptionRows.length,
  visibilityCases: visibilityRows.length, events: events.length, photos: photos.length,
  photosUnassigned: photos.filter((p) => !p.animalId).length, issues: issues.length,
  productsLinked: catalog?.productsLinked, clinicsLinked: catalog?.clinicsLinked,
  issuesBySheet: issues.reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.sheet]: (acc[i.sheet] ?? 0) + 1 }), {}),
}, null, 2));
await pg.end();
