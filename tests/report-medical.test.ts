import { describe, expect, it } from "vitest";
import { summarizeMedical, type MedicalRow } from "../src/lib/report-medical";

const row = (over: Partial<MedicalRow>): MedicalRow => ({
  animalId: "a", kind: "vaccine_polyvalent", date: "2026-03-10", precision: "day", result: null, clinic: "Vet A", product: null, sex: "f", ...over,
});
const FROM = "2026-01-01";
const TO = "2026-06-30";

describe("summarizeMedical", () => {
  it("counts work by kind and month, and the animals it was done for", () => {
    const s = summarizeMedical([row({}), row({ animalId: "b", date: "2026-04-01" }), row({ kind: "sterilization", date: "2026-04-02" })], FROM, TO);
    expect(s.totals.vaccine_polyvalent).toBe(2);
    expect(s.totals.sterilization).toBe(1);
    expect(s.animals).toBe(2);
    expect(s.monthly.find((m) => m.month === "2026-04")).toMatchObject({ vaccine_polyvalent: 1, sterilization: 1 });
  });

  it("leaves out weights and notes, and records outside the range", () => {
    const s = summarizeMedical([row({ kind: "weight" }), row({ kind: "note" }), row({ date: "2025-12-31" }), row({ date: null })], FROM, TO);
    expect(Object.values(s.totals).reduce((a, b) => a + b, 0)).toBe(0);
    expect(s.byClinic).toEqual([]);
  });

  it("applies the approximate-date rules", () => {
    const year = row({ date: "2026-01-01", precision: "year" });
    expect(summarizeMedical([year], "2026-01-01", "2026-12-31")).toMatchObject({ yearOnly: 1, totals: { vaccine_polyvalent: 1 } });
    expect(summarizeMedical([year], FROM, TO)).toMatchObject({ uncertain: 1, totals: { vaccine_polyvalent: 0 } });
  });

  it("ranks clinics and products by work done, with unknown ones last", () => {
    const s = summarizeMedical(
      [row({ clinic: null }), row({ clinic: null }), row({ clinic: null }), row({ clinic: "Vet B", product: "Feligen" }), row({ clinic: "Vet B" }), row({})],
      FROM, TO,
    );
    expect(s.byClinic.map((c) => [c.name, c.total])).toEqual([["Vet B", 2], ["Vet A", 1], [null, 3]]);
    expect(s.byProduct.map((p) => [p.name, p.total])).toEqual([["Feligen", 1]]);
  });

  it("splits sterilisations by sex", () => {
    const s = summarizeMedical([row({ kind: "sterilization", sex: "m" }), row({ kind: "sterilization", sex: "unknown" }), row({ kind: "sterilization" })], FROM, TO);
    expect(s.sterilizationsBySex).toEqual({ f: 1, m: 1, unknown: 1 });
  });

  it("works out the positive rate from tests with a result only", () => {
    const s = summarizeMedical(
      [row({ kind: "test_fiv_felv", result: "positive" }), row({ kind: "test_fiv_felv", result: "negative" }), row({ kind: "test_fiv_felv", result: "negative" }), row({ kind: "test_fiv_felv" })],
      FROM, TO,
    );
    expect(s.tests.find((r) => r.kind === "test_fiv_felv")).toEqual({ kind: "test_fiv_felv", total: 4, positive: 1, negative: 2, noResult: 1, positiveRate: 1 / 3 });
    expect(s.tests.find((r) => r.kind === "test_corona")?.positiveRate).toBeNull();
  });
});
