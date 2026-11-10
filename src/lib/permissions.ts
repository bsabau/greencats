export type Role = "admin" | "coordinator" | "volunteer";
export type Actor = { role: Role; ownsAdoptions: boolean; ownsVisibility: boolean };

export type Permission =
  | "animals:edit"
  | "medical:edit"
  | "calendar:edit"
  | "calendar:manage_all"
  | "contacts:view_full"
  | "microchip:view"
  | "contacts:edit"
  | "adoptions:edit"
  | "adoptions:export"
  | "visibility:edit"
  | "review:manage"
  | "users:manage"
  | "audit:view"
  | "medical:delete_any"
  | "animals:delete"
  | "people:export"
  | "privacy:manage"
  | "lists:manage";

/**
 * Who can do what. Follows the team's "Reguli SHEETS" tab: anyone may update
 * cats and medical data, adoptions have one owner, visibility cases have one
 * owner. Added on top: full phone numbers and addresses are limited.
 */
export function can(actor: Actor, permission: Permission): boolean {
  const admin = actor.role === "admin";
  const coordinator = actor.role === "coordinator";
  switch (permission) {
    case "animals:edit":
    case "medical:edit":
    case "calendar:edit":
      return true;
    case "calendar:manage_all":
    case "contacts:edit":
    case "review:manage":
    case "medical:delete_any":
    case "people:export":
    case "lists:manage":
      return admin || coordinator;
    case "contacts:view_full":
    case "microchip:view":
    case "adoptions:export":
      return admin || coordinator || actor.ownsAdoptions;
    case "adoptions:edit":
      return admin || actor.ownsAdoptions;
    case "visibility:edit":
      return admin || actor.ownsVisibility;
    case "users:manage":
    case "audit:view":
    case "animals:delete":
    case "privacy:manage":
      return admin;
  }
}

export const REDACTED = "[tel. ascuns]";
export const HIDDEN = "[ascuns]";

// Digits may be split by spaces, dots, dashes and brackets.
const SEP = String.raw`[ .\-()]*`;
const PHONE = new RegExp(
  // Not inside a longer number, such as a microchip or a decimal. "tel.0740…" and "…0740000113." are numbers.
  String.raw`(?<!\d)(?<!\d\.)` +
    // A date such as 07.05.2026 followed by a time isn't a phone number.
    String.raw`(?!\d{1,2}[.\-]\d{1,2}[.\-]\d{2,4}(?!\d))` +
    "(?:" +
    [
      // Any country code written with + or 00: +40 740 000 101, 0033 6 39 98 01 08, +44 20 7946 0958.
      String.raw`(?:\+|00)${SEP}[1-9](?:${SEP}\d){7,13}`,
      // Romanian or French code without the +, as found in the team's notes: 40 740 000 101, 33(0)639980105.
      String.raw`(?:40|33)${SEP}(?:0${SEP})?[2367](?:${SEP}\d){8}`,
      // Romanian numbers: mobiles (07…) and landlines (02…, 03…).
      String.raw`0${SEP}[237](?:${SEP}\d){8}`,
      // A mobile written without its leading 0: 740 000 101.
      String.raw`7(?:${SEP}\d){8}`,
    ].join("|") +
    ")" +
    String.raw`(?!\d)(?!\.\d)`,
  "g",
);

/** The phone numbers written in a text. */
export const phonesIn = (text: string): string[] => text.match(PHONE) ?? [];

export const stripPhones = (text: string) => text.replace(PHONE, "").replace(/\(\s*\)/g, "").replace(/\s+/g, " ").replace(/[\s\-–]+$/, "").trim();

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
export const REDACTED_EMAIL = "[e-mail ascuns]";

/** Hides phone numbers and e-mail addresses inside free text. Street addresses can't be detected this way. */
export function redactPhones<T extends string | null | undefined>(actor: Actor, text: T): T {
  if (!text || can(actor, "contacts:view_full")) return text;
  return text.replace(PHONE, REDACTED).replace(EMAIL, REDACTED_EMAIL) as T;
}

/** The microchip is personal data: it leads to the owner's registration. Others see only that there is one. */
export const hideMicrochip = <T extends string | null | undefined>(actor: Actor, chip: T): T | typeof HIDDEN =>
  chip && !can(actor, "microchip:view") ? HIDDEN : chip;

/** True when the actor would see part of this text hidden. */
export const hasHidden = (actor: Actor, text: string | null | undefined): boolean => !!text && redactPhones(actor, text) !== text;

/** Every text field of an animal a person can type into, so a number written in an unexpected box stays hidden too. */
export const ANIMAL_TEXT_FIELDS = [
  "locationNote", "currentTreatment", "intakeHistory", "medicalSummary", "otherInfo", "refillNotes", "deathNote",
  "contractText", "birthText", "intakeText", "sterilizedText", "color", "healthBookNo", "passport",
] as const;
/** The ones the edit form changes. One holding hidden text can't be edited by someone who can't see it. */
export const ANIMAL_EDITABLE_TEXT_FIELDS = [
  "color", "healthBookNo", "passport", "locationNote", "currentTreatment", "intakeHistory", "medicalSummary", "otherInfo",
] as const;

/** Applies the same hiding to every named text field of a row, so a page can't forget one. */
export function redactFields<T extends object>(actor: Actor, row: T, keys: readonly (keyof T)[]): T {
  if (can(actor, "contacts:view_full")) return row;
  const copy = { ...row };
  for (const key of keys) {
    const value = copy[key];
    if (typeof value === "string") copy[key] = redactPhones(actor, value) as T[keyof T];
  }
  return copy;
}

/** Removes contact details for anyone who may not see them. Applied before data reaches a page. */
export function maskContact<
  T extends { phones: string[]; address: string | null; email: string | null; notes: string | null; fosterRating?: string; consentNote?: string | null },
>(actor: Actor, person: T): T {
  if (can(actor, "contacts:view_full")) return person;
  // The foster rating is a judgement about a person, so it is hidden along with the contact details.
  return {
    ...person, phones: [], address: null, email: null, notes: null,
    ...("fosterRating" in person ? { fosterRating: "unrated" } : {}),
    ...("consentNote" in person ? { consentNote: null } : {}),
  };
}
