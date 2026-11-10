import { addDays, addMonths, daysBetween } from "./dates";

export type MedicalKind =
  | "vaccine_polyvalent"
  | "vaccine_rabies"
  | "deworm_external"
  | "deworm_internal"
  | "test_fiv_felv"
  | "test_corona"
  | "test_giardia"
  | "test_mange"
  | "sterilization"
  | "treatment"
  | "visit"
  | "weight"
  | "note";

/**
 * Default reminder intervals. These are working assumptions, not veterinary
 * advice: the shelter's vet should confirm them. Any record's due date can be
 * edited by hand.
 */
export const SCHEDULE = {
  kittenAgeDays: 112, // Under 16 weeks a polyvalent dose is part of the kitten series.
  polyvalentKittenBoosterDays: 21,
  yearlyMonths: 12,
  externalDewormDays: 30,
  internalDewormKittenDays: 30,
  internalDewormAdultDays: 90,
  sterilizationAgeMonths: 6,
} as const;

/** The record types that repeat. Only these take a product, and only these get a next due date. */
export const PRODUCT_KINDS = ["vaccine_polyvalent", "vaccine_rabies", "deworm_external", "deworm_internal"] as const satisfies readonly MedicalKind[];

/**
 * Returns when the next dose is due, or null for kinds that do not repeat.
 * A product's own interval replaces the general rule, except during the kitten
 * series, where the shorter kitten interval always applies.
 */
export function nextDue(kind: MedicalKind, date: string, birthDate: string | null, productIntervalDays?: number | null): string | null {
  const ageDays = birthDate ? daysBetween(birthDate, date) : null;
  const isKitten = ageDays !== null && ageDays >= 0 && ageDays < SCHEDULE.kittenAgeDays;
  const kittenRule = isKitten && (kind === "vaccine_polyvalent" || kind === "deworm_internal");
  if (productIntervalDays && productIntervalDays > 0 && !kittenRule && (PRODUCT_KINDS as readonly string[]).includes(kind)) {
    return addDays(date, productIntervalDays);
  }
  switch (kind) {
    case "vaccine_polyvalent":
      return isKitten
        ? addDays(date, SCHEDULE.polyvalentKittenBoosterDays)
        : addMonths(date, SCHEDULE.yearlyMonths);
    case "vaccine_rabies":
      return addMonths(date, SCHEDULE.yearlyMonths);
    case "deworm_external":
      return addDays(date, SCHEDULE.externalDewormDays);
    case "deworm_internal":
      return addDays(
        date,
        isKitten ? SCHEDULE.internalDewormKittenDays : SCHEDULE.internalDewormAdultDays,
      );
    default:
      return null;
  }
}

export function sterilizationDue(birthDate: string): string {
  return addMonths(birthDate, SCHEDULE.sterilizationAgeMonths);
}
