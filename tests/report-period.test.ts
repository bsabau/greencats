import { describe, expect, it } from "vitest";
import { summarizePeriod, type PeriodAnimal, type PeriodPlacement } from "../src/lib/report-period";

const FROM = "2026-01-01";
const TO = "2026-06-30";

const animal = (id: string, over: Partial<PeriodAnimal> = {}): PeriodAnimal => ({
  id, name: id, species: "cat", sex: "f", status: "in_shelter",
  intakeDate: "2026-02-10", intakePrecision: "day", birthDate: "2025-12-01", deathDate: null, ...over,
});
const placement = (animalId: string, kind: string, startDate: string | null, endDate: string | null = null, open = endDate === null): PeriodPlacement => ({
  animalId, kind, startDate, endDate, open,
});

describe("summarizePeriod", () => {
  it("counts intakes, adoptions and deaths by month", () => {
    const s = summarizePeriod(
      [animal("a"), animal("b", { status: "adopted" }), animal("c", { status: "deceased", deathDate: "2026-04-02" })],
      [placement("b", "adoption", "2026-03-20")],
      [],
      FROM, TO,
    );
    expect(s.totals).toMatchObject({ intakes: 3, adoptions: 1, deaths: 1 });
    expect(s.monthly.find((m) => m.month === "2026-02")).toMatchObject({ intakes: 3 });
    expect(s.monthly.find((m) => m.month === "2026-03")).toMatchObject({ adoptions: 1 });
    expect(s.monthly.find((m) => m.month === "2026-04")).toMatchObject({ deaths: 1 });
    expect(s.monthly).toHaveLength(6);
  });

  it("leaves out animals the shelter never took in", () => {
    const s = summarizePeriod([animal("x", { status: "external" }), animal("y", { status: "unknown" })], [], [], FROM, TO);
    expect(s.totals.intakes).toBe(0);
    expect(s.totals.inCareAtEnd).toBe(0);
  });

  it("puts a year-only intake in the total but no month, and flags one that may or may not fall in the range", () => {
    const s = summarizePeriod(
      [animal("y", { intakeDate: "2026-01-01", intakePrecision: "year" })],
      [], [], "2026-01-01", "2026-12-31",
    );
    expect(s.totals.intakes).toBe(1);
    expect(s.yearOnly).toBe(1);
    expect(s.monthly.reduce((n, m) => n + m.intakes, 0)).toBe(0);
    expect(summarizePeriod([animal("y", { intakeDate: "2026-01-01", intakePrecision: "year" })], [], [], FROM, TO).uncertain).toBe(1);
  });

  it("works out who was in care at the start and the end", () => {
    const s = summarizePeriod(
      [
        animal("before", { intakeDate: "2025-10-01" }),
        animal("adopted", { intakeDate: "2025-10-01", status: "adopted" }),
        animal("died", { intakeDate: "2025-10-01", status: "deceased", deathDate: "2026-05-01" }),
        animal("new"),
        animal("noIntake", { intakeDate: null }),
        animal("lost", { intakeDate: "2025-01-01", status: "adopted" }),
      ],
      [placement("adopted", "adoption", "2026-03-01")],
      [], FROM, TO,
    );
    expect(s.totals.inCareAtStart).toBe(3);
    expect(s.totals.inCareAtEnd).toBe(2);
    expect(s.noIntake).toBe(1);
    expect(s.unknownExit).toBe(1);
  });

  it("counts a returned adoption, and puts the animal back in care", () => {
    const s = summarizePeriod(
      [animal("r", { intakeDate: "2025-10-01" })],
      [placement("r", "adoption", "2026-02-01", "2026-03-15", false)],
      [], FROM, TO,
    );
    expect(s.totals.returns).toBe(1);
    expect(s.totals.inCareAtEnd).toBe(1);
    expect(s.animals[0]).toMatchObject({ adoptedOn: "2026-02-01", returnedOn: "2026-03-15" });
  });

  it("doesn't call it a return when the animal died or moved on to an adoption", () => {
    const s = summarizePeriod(
      [
        animal("d", { status: "deceased", deathDate: "2026-03-15" }),
        animal("f", { status: "adopted" }),
      ],
      [
        placement("d", "adoption", "2026-02-20", "2026-03-15", false),
        placement("f", "foster_adoption", "2026-02-20", "2026-04-01", false),
        placement("f", "adoption", "2026-04-01"),
      ],
      [], FROM, TO,
    );
    expect(s.totals.returns).toBe(0);
    expect(s.totals.fosterStarts).toBe(1);
  });

  it("ignores an imported placement closed without a date once the animal is back in care", () => {
    const s = summarizePeriod(
      [animal("back", { intakeDate: "2025-01-10" })],
      [placement("back", "adoption", "2025-06-01", null, false)],
      [], FROM, TO,
    );
    expect(s.totals.inCareAtStart).toBe(1);
  });

  it("measures length of stay by species and age at intake", () => {
    const s = summarizePeriod(
      [
        animal("k", { birthDate: "2026-01-01", intakeDate: "2026-02-01", status: "adopted" }),
        animal("o", { birthDate: "2020-01-01", intakeDate: "2026-01-01", status: "adopted" }),
        animal("v", { intakeDate: "2025-01-01", intakePrecision: "year", status: "adopted" }),
      ],
      [placement("k", "adoption", "2026-03-03"), placement("o", "adoption", "2026-04-11"), placement("v", "adoption", "2026-05-01")],
      [], FROM, TO,
    );
    expect(s.stays.find((r) => r.group === "all")?.spread).toMatchObject({ n: 2, median: 65 });
    expect(s.stays.find((r) => r.key === "kitten")?.spread).toMatchObject({ n: 1, median: 30 });
    expect(s.stays.find((r) => r.key === "adult")?.spread).toMatchObject({ n: 1, median: 100 });
    expect(s.stays.find((r) => r.key === "dog")).toBeUndefined();
  });

  it("counts sterilisations with the same date rules", () => {
    const s = summarizePeriod(
      [animal("s")],
      [],
      [{ animalId: "s", date: "2026-03-01", precision: "month" }, { animalId: "s", date: "2025-12-01", precision: "day" }, { animalId: "other", date: "2026-03-01", precision: "day" }],
      FROM, TO,
    );
    expect(s.totals.sterilizations).toBe(1);
  });
});
