export type Role = "admin" | "coordinator" | "volunteer";
export type Actor = { role: Role; ownsAdoptions: boolean; ownsVisibility: boolean };

export type Permission =
  | "animals:edit"
  | "medical:edit"
  | "calendar:edit"
  | "calendar:manage_all"
  | "contacts:view_full"
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
// Romanian and French mobile numbers, the forms found in the team's notes.
const PHONE = /(?<![\d.])(?:\+?(?:40|33)[ .\-()]*(?:0[ .\-()]*)?[67]|0[ .\-()]*7)(?:[ .\-()]*\d){8}(?![\d.])/g;

export const stripPhones = (text: string) => text.replace(PHONE, "").replace(/\(\s*\)/g, "").replace(/\s+/g, " ").replace(/[\s\-–]+$/, "").trim();

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
export const REDACTED_EMAIL = "[e-mail ascuns]";

/** Hides phone numbers and e-mail addresses inside free text. Street addresses and landlines can't be detected this way. */
export function redactPhones<T extends string | null | undefined>(actor: Actor, text: T): T {
  if (!text || can(actor, "contacts:view_full")) return text;
  return text.replace(PHONE, REDACTED).replace(EMAIL, REDACTED_EMAIL) as T;
}

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
