import { describe, expect, it } from "vitest";
import { REDACTED, REDACTED_EMAIL, can, hasHidden, maskContact, redactFields, redactPhones, stripPhones, type Actor } from "../src/lib/permissions";
import { nextDue, sterilizationDue } from "../src/lib/medical-schedule";

const volunteer: Actor = { role: "volunteer", ownsAdoptions: false, ownsVisibility: false };
const coordinator: Actor = { ...volunteer, role: "coordinator" };
const admin: Actor = { ...volunteer, role: "admin" };
const adoptionsOwner: Actor = { ...volunteer, ownsAdoptions: true };
const visibilityOwner: Actor = { ...volunteer, ownsVisibility: true };

describe("permissions", () => {
  it("lets every volunteer edit cats and medical data", () => {
    expect(can(volunteer, "animals:edit")).toBe(true);
    expect(can(volunteer, "medical:edit")).toBe(true);
  });
  it("hides contact details from ordinary volunteers", () => {
    expect(can(volunteer, "contacts:view_full")).toBe(false);
    expect(can(coordinator, "contacts:view_full")).toBe(true);
    expect(can(adoptionsOwner, "contacts:view_full")).toBe(true);
  });
  it("restricts adoption edits to the owner and admins", () => {
    expect(can(coordinator, "adoptions:edit")).toBe(false);
    expect(can(adoptionsOwner, "adoptions:edit")).toBe(true);
    expect(can(admin, "adoptions:edit")).toBe(true);
  });
  it("restricts visibility edits to the owner and admins", () => {
    expect(can(coordinator, "visibility:edit")).toBe(false);
    expect(can(visibilityOwner, "visibility:edit")).toBe(true);
  });
  it("keeps user management for admins", () => {
    expect(can(coordinator, "users:manage")).toBe(false);
    expect(can(admin, "users:manage")).toBe(true);
  });
  it("strips contact fields for volunteers and keeps them for coordinators", () => {
    const person = { name: "X", phones: ["+40700000000"], address: "Str. Y", email: "x@y.z", notes: "private" };
    expect(maskContact(volunteer, person)).toEqual({ name: "X", phones: [], address: null, email: null, notes: null });
    expect(maskContact(coordinator, person)).toEqual(person);
  });
});

describe("data protection permissions", () => {
  it("keeps erasing, account and animal deletion for admins", () => {
    for (const p of ["privacy:manage", "animals:delete"] as const) {
      expect(can(volunteer, p)).toBe(false);
      expect(can(coordinator, p)).toBe(false);
      expect(can(admin, p)).toBe(true);
    }
  });
  it("lets coordinators export a person, delete others' medical records and edit the lists, not volunteers", () => {
    for (const p of ["people:export", "medical:delete_any", "lists:manage"] as const) {
      expect(can(volunteer, p)).toBe(false);
      expect(can(adoptionsOwner, p)).toBe(false);
      expect(can(coordinator, p)).toBe(true);
    }
  });
  it("hides the foster rating and consent note from volunteers", () => {
    const person = { name: "X", phones: [], address: null, email: null, notes: null, fosterRating: "not_ok", consentNote: "contract" };
    expect(maskContact(volunteer, person)).toMatchObject({ fosterRating: "unrated", consentNote: null });
    expect(maskContact(coordinator, person)).toMatchObject({ fosterRating: "not_ok", consentNote: "contract" });
  });
  it("redacts every named field of a row and leaves the rest", () => {
    const row = { animalName: "Ana Pop (0740000113)", details: "scrie la ana@example.org", id: "0740000113", count: 3 };
    const out = redactFields(volunteer, row, ["animalName", "details"]);
    expect(out.animalName).toBe(`Ana Pop (${REDACTED})`);
    expect(out.details).toBe(`scrie la ${REDACTED_EMAIL}`);
    expect(out.id).toBe("0740000113");
    expect(redactFields(coordinator, row, ["animalName", "details"])).toEqual(row);
  });
});

describe("phone redaction in notes", () => {
  it.each(["0740000113 - Wapp", "suna la 0 740 000 114 azi", "33(0)639980105", "+33 6 39 98 01 08", "(+40) 740 000 101"])("hides %s", (note) => {
    const out = redactPhones(volunteer, note);
    expect(out).toContain(REDACTED);
    expect(out.replace(REDACTED, "")).not.toMatch(/\d{3}/);
  });
  it.each(["2026.08.31 FIV/Felv negativ", "carnet: B 60 19447", "CIP: 642090002330723", "Contract 1626/"])("keeps %s", (note) => {
    expect(redactPhones(volunteer, note)).toBe(note);
  });
  it("shows notes unchanged to coordinators", () => {
    expect(redactPhones(coordinator, "0740000113")).toBe("0740000113");
  });
  it("tells when a volunteer would see part of a text hidden", () => {
    expect(hasHidden(volunteer, "tabby, sunati la 0740000150")).toBe(true);
    expect(hasHidden(volunteer, "scrie la ana@example.org")).toBe(true);
    expect(hasHidden(volunteer, "tabby")).toBe(false);
    expect(hasHidden(volunteer, null)).toBe(false);
    expect(hasHidden(coordinator, "0740000150")).toBe(false);
  });
  it("cleans a phone out of a name", () => {
    expect(stripPhones("pisoiul fara ureche - Ion Popescu (0740000112)")).toBe("pisoiul fara ureche - Ion Popescu");
  });
});

describe("medical schedule", () => {
  it("gives kittens a three-week polyvalent booster", () => {
    expect(nextDue("vaccine_polyvalent", "2026-08-31", "2026-06-15")).toBe("2026-09-21");
  });
  it("gives adults a yearly polyvalent booster", () => {
    expect(nextDue("vaccine_polyvalent", "2026-08-31", "2022-01-01")).toBe("2027-08-31");
  });
  it("treats an unknown birth date as an adult", () => {
    expect(nextDue("vaccine_polyvalent", "2026-08-31", null)).toBe("2027-08-31");
  });
  it("does not schedule one-off kinds", () => {
    expect(nextDue("test_fiv_felv", "2026-08-31", null)).toBeNull();
  });
  it("suggests sterilization at six months", () => {
    expect(sterilizationDue("2026-06-01")).toBe("2026-12-01");
  });
});
