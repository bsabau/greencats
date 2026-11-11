import { describe, expect, it } from "vitest";
import { fillRate, longStays, summarizeShifts, type CareAnimal, type ShiftRow } from "../src/lib/report-shifts";

const shift = (over: Partial<ShiftRow>): ShiftRow => ({ id: "s", title: "Tură", startOn: "2026-03-10", startTime: "10:00", capacity: 2, signups: 1, ...over });
const animal = (over: Partial<CareAnimal>): CareAnimal => ({
  id: "a", name: "Mitzi", status: "in_shelter", location: null, intakeDate: "2026-01-01", intakePrecision: "day", photos: 1, lastMedical: null, ...over,
});

describe("summarizeShifts", () => {
  it("counts places taken, without letting extra sign-ups fill other shifts", () => {
    const s = summarizeShifts(
      [shift({}), shift({ signups: 5 }), shift({ capacity: null, signups: 0, startOn: "2026-04-01" }), shift({ startOn: "2025-12-31" })],
      "2026-03-01", "2026-04-30", "2026-07-01",
    );
    expect(s.monthly).toEqual([
      { month: "2026-03", shifts: 2, places: 4, filled: 3, signups: 6, empty: 0 },
      { month: "2026-04", shifts: 1, places: 0, filled: 0, signups: 0, empty: 1 },
    ]);
    expect(s.fillRate).toBe(0.75);
  });

  it("lists shifts in the next 30 days that still need people, soonest first", () => {
    const s = summarizeShifts(
      [
        shift({ id: "full", startOn: "2026-07-05", signups: 2 }),
        shift({ id: "later", startOn: "2026-07-20", startTime: "09:00" }),
        shift({ id: "soon", startOn: "2026-07-02", signups: 0 }),
        shift({ id: "nocap", startOn: "2026-07-03", capacity: null, signups: 0 }),
        shift({ id: "past", startOn: "2026-06-30", signups: 0 }),
        shift({ id: "far", startOn: "2026-08-15", signups: 0 }),
      ],
      "2026-01-01", "2026-06-30", "2026-07-01",
    );
    expect(s.open.map((x) => [x.id, x.missing])).toEqual([["soon", 2], ["nocap", null], ["later", 1]]);
  });

  it("has no fill rate without capacities", () => {
    expect(fillRate(0, 0)).toBeNull();
  });
});

describe("longStays", () => {
  it("sorts by days in care, then year-only intakes, then unknown ones", () => {
    const { rows, unknown } = longStays(
      [
        animal({ id: "recent", intakeDate: "2026-06-01" }),
        animal({ id: "none", intakeDate: null, intakePrecision: null }),
        animal({ id: "year", intakeDate: "2020-01-01", intakePrecision: "year" }),
        animal({ id: "old", intakeDate: "2024-05-01", intakePrecision: "month"}),
      ],
      "2026-07-01",
    );
    expect(rows.map((r) => [r.id, r.days])).toEqual([["old", 777], ["recent", 30], ["year", null], ["none", null]]);
    expect(unknown).toBe(1);
  });
});
