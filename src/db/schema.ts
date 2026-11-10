import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "coordinator", "volunteer"]);
export const localeEnum = pgEnum("locale", ["ro", "en"]);
export const speciesEnum = pgEnum("species", ["cat", "dog"]);
export const sexEnum = pgEnum("sex", ["f", "m", "unknown"]);
export const sterilizedEnum = pgEnum("sterilized", ["yes", "no", "unknown"]);
export const precisionEnum = pgEnum("date_precision", ["day", "month", "year"]);
// "in_shelter" replaced the fixed places "casuta" and "ana_adi"; where in the shelter is animals.locationId.
export const animalStatusEnum = pgEnum("animal_status", [
  "in_shelter",
  "clinic",
  "foster",
  "foster_adoption",
  "adoption_incomplete",
  "adopted",
  "deceased",
  "external",
  "unknown",
]);
export const placementKindEnum = pgEnum("placement_kind", [
  "foster",
  "foster_adoption",
  "adoption_incomplete",
  "adoption",
]);
export const fosterRatingEnum = pgEnum("foster_rating", [
  "ok",
  "conditional",
  "not_ok",
  "unrated",
]);
export const medicalKindEnum = pgEnum("medical_kind", [
  "vaccine_polyvalent",
  "vaccine_rabies",
  "deworm_external",
  "deworm_internal",
  "test_fiv_felv",
  "test_corona",
  "test_giardia",
  "test_mange",
  "sterilization",
  "treatment",
  "visit",
  "weight",
  "note",
]);
export const testResultEnum = pgEnum("test_result", ["positive", "negative"]);
export const eventTypeEnum = pgEnum("event_type", [
  "medical",
  "foster_logistics",
  "adoption",
  "shift",
  "other",
]);
export const adoptionStageEnum = pgEnum("adoption_stage", [
  "paperwork",
  "to_verify",
  "external",
  "done",
]);

const id = () => uuid("id").primaryKey().defaultRandom();
const created = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("volunteer"),
  ownsAdoptions: boolean("owns_adoptions").notNull().default(false),
  ownsVisibility: boolean("owns_visibility").notNull().default(false),
  locale: localeEnum("locale").notNull().default("ro"),
  active: boolean("active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  createdAt: created(),
});

export const sessions = pgTable("sessions", {
  // SHA-256 of the cookie token, so a database leak does not expose live sessions.
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: created(),
});

export const animals = pgTable(
  "animals",
  {
    id: id(),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    species: speciesEnum("species").notNull().default("cat"),
    status: animalStatusEnum("status").notNull().default("unknown"),
    sex: sexEnum("sex").notNull().default("unknown"),
    color: text("color"),
    // Every approximate date keeps the team's original wording next to the parsed value.
    birthDate: date("birth_date"),
    birthPrecision: precisionEnum("birth_precision"),
    birthText: text("birth_text"),
    intakeDate: date("intake_date"),
    intakePrecision: precisionEnum("intake_precision"),
    intakeText: text("intake_text"),
    deathDate: date("death_date"),
    deathNote: text("death_note"),
    sterilized: sterilizedEnum("sterilized").notNull().default("unknown"),
    sterilizedText: text("sterilized_text"),
    contractText: text("contract_text"),
    healthBookNo: text("health_book_no"),
    microchip: text("microchip"),
    passport: text("passport"),
    currentTreatment: text("current_treatment"),
    intakeHistory: text("intake_history"),
    medicalSummary: text("medical_summary"),
    otherInfo: text("other_info"),
    refillNotes: text("refill_notes"),
    locationNote: text("location_note"),
    // Which shelter place, for animals "in_shelter" only.
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "restrict" }),
    profile: jsonb("profile").$type<Record<string, string>>(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("animals_status_idx").on(t.status),
    index("animals_name_idx").on(t.name),
    index("animals_location_idx").on(t.locationId),
    check("animals_location_in_shelter", sql`${t.locationId} is null or ${t.status} = 'in_shelter'`),
  ],
);

/** The places in the shelter where cats live. Edited on the Lists page. */
export const locations = pgTable(
  "locations",
  {
    id: id(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: created(),
  },
  (t) => [uniqueIndex("locations_name_idx").on(sql`lower(${t.name})`)],
);

export const people = pgTable(
  "people",
  {
    id: id(),
    name: text("name").notNull(),
    phones: text("phones").array().notNull().default(sql`'{}'::text[]`),
    email: text("email"),
    address: text("address"),
    notes: text("notes"),
    fosterRating: fosterRatingEnum("foster_rating").notNull().default("unrated"),
    externalCase: boolean("external_case").notNull().default(false),
    // Why the shelter holds this person's data, for example "contract de adopție 12.03.2024".
    consentNote: text("consent_note"),
    // Set when the personal data was erased. The row stays so a cat's history keeps its shape.
    erasedAt: timestamp("erased_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("people_name_idx").on(t.name)],
);

export const placements = pgTable(
  "placements",
  {
    id: id(),
    animalId: uuid("animal_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    kind: placementKindEnum("kind").notNull(),
    startDate: date("start_date"),
    startText: text("start_text"),
    endDate: date("end_date"),
    notes: text("notes"),
    open: boolean("open").notNull().default(true),
    createdAt: created(),
  },
  (t) => [
    index("placements_animal_idx").on(t.animalId),
    index("placements_person_idx").on(t.personId),
  ],
);

export const medicalRecords = pgTable(
  "medical_records",
  {
    id: id(),
    animalId: uuid("animal_id")
      .notNull()
      .references(() => animals.id, { onDelete: "cascade" }),
    kind: medicalKindEnum("kind").notNull(),
    date: date("date"),
    precision: precisionEnum("precision"),
    description: text("description"),
    result: testResultEnum("result"),
    nextDueOn: date("next_due_on"),
    rawText: text("raw_text"),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    clinicId: uuid("clinic_id").references(() => clinics.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [
    index("medical_animal_kind_idx").on(t.animalId, t.kind),
    index("medical_due_idx").on(t.nextDueOn),
    index("medical_product_idx").on(t.productId),
  ],
);

/** Medicines and vaccines the team uses. Edited on the Lists page. */
export const products = pgTable(
  "products",
  {
    id: id(),
    name: text("name").notNull(),
    // The medical record types a product can be recorded under. Combined products list two.
    kinds: medicalKindEnum("kinds").array().notNull(),
    // Days until the next dose. Empty means the general rule in medical-schedule.ts.
    intervalDays: integer("interval_days"),
    active: boolean("active").notNull().default(true),
    createdAt: created(),
  },
  (t) => [uniqueIndex("products_name_idx").on(sql`lower(${t.name})`)],
);

/** Spellings found in notes for a product, normalized with normalizeTerm(). The product's own name is one of them. */
export const productAliases = pgTable("product_aliases", {
  alias: text("alias").primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
});

export const clinics = pgTable(
  "clinics",
  {
    id: id(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: created(),
  },
  (t) => [uniqueIndex("clinics_name_idx").on(sql`lower(${t.name})`)],
);

export const clinicAliases = pgTable("clinic_aliases", {
  alias: text("alias").primaryKey(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinics.id, { onDelete: "cascade" }),
});

export const adoptionCases = pgTable("adoption_cases", {
  id: id(),
  animalId: uuid("animal_id").references(() => animals.id, { onDelete: "set null" }),
  animalName: text("animal_name").notNull(),
  personId: uuid("person_id").references(() => people.id, { onDelete: "set null" }),
  adopterName: text("adopter_name"),
  stage: adoptionStageEnum("stage").notNull().default("paperwork"),
  healthBook: text("health_book"),
  contractNo: text("contract_no"),
  vaccine: text("vaccine"),
  microchip: text("microchip"),
  passport: text("passport"),
  notes: text("notes"),
  statusNote: text("status_note"),
  nextStepOn: date("next_step_on"),
  createdAt: created(),
  updatedAt: updated(),
});

export const visibilityCases = pgTable("visibility_cases", {
  id: id(),
  contactName: text("contact_name"),
  animalName: text("animal_name").notNull(),
  photosRef: text("photos_ref"),
  contractReceived: text("contract_received"),
  readyForSite: text("ready_for_site"),
  onSite: text("on_site"),
  interestedPerson: text("interested_person"),
  details: text("details"),
  infoSheet: text("info_sheet"),
  description: text("description"),
  extra: text("extra"),
  createdAt: created(),
  updatedAt: updated(),
});

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: id(),
    type: eventTypeEnum("type").notNull().default("other"),
    title: text("title").notNull(),
    startOn: date("start_on").notNull(),
    endOn: date("end_on"),
    startTime: text("start_time"),
    endTime: text("end_time"),
    notes: text("notes"),
    capacity: integer("capacity"),
    animalId: uuid("animal_id").references(() => animals.id, { onDelete: "set null" }),
    personId: uuid("person_id").references(() => people.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: created(),
  },
  (t) => [index("events_start_idx").on(t.startOn)],
);

export const shiftSignups = pgTable(
  "shift_signups",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

export const photos = pgTable("photos", {
  id: id(),
  animalId: uuid("animal_id").references(() => animals.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  importNote: text("import_note"),
  createdAt: created(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    detail: jsonb("detail"),
    createdAt: created(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

export const importIssues = pgTable("import_issues", {
  id: id(),
  sheet: text("sheet").notNull(),
  row: integer("row"),
  field: text("field"),
  rawValue: text("raw_value"),
  message: text("message").notNull(),
  animalId: uuid("animal_id").references(() => animals.id, { onDelete: "cascade" }),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: created(),
});
