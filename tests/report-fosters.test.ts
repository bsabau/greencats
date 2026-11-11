import { describe, expect, it } from "vitest";
import { summarizeFosters, type AdoptionCaseRow, type FosterPlacement } from "../src/lib/report-fosters";

const FROM = "2026-01-01";
const TO = "2026-06-30";
const TODAY = "2026-07-01";
const p = (over: Partial<FosterPlacement>): FosterPlacement => ({
  animalId: "a", animalName: "Mitzi", kind: "foster", startDate: "2026-02-01", endDate: null, open: true,
  personId: "p1", personName: "Ana", personErased: false, fosterRating: "ok", deathDate: null, ...over,
});
const c = (over: Partial<AdoptionCaseRow>): AdoptionCaseRow => ({ animalName: "Mitzi", adopterName: "Ion", stage: "paperwork", openedOn: "2026-06-01", nextStepOn: null, ...over });

describe("summarizeFosters", () => {
  it("groups the animals in foster now by person, busiest first", () => {
    const s = summarizeFosters(
      [p({}), p({ animalId: "b", animalName: "Bubu", startDate: "2026-01-15" }), p({ animalId: "c", animalName: "Coco", personId: "p2", personName: "Dan" })],
      [], FROM, TO, TODAY,
    );
    expect(s.activeFosters.map((f) => [f.name, f.animals, f.since])).toEqual([
      ["Ana", ["Bubu", "Mitzi"], "2026-01-15"],
      ["Dan", ["Coco"], "2026-02-01"],
    ]);
    expect(s.activeAnimals).toBe(3);
    expect(s.started).toBe(3);
    expect(s.currentStay?.median).toBe(150);
  });

  it("follows how ended foster stays turned out", () => {
    const s = summarizeFosters(
      [
        p({ endDate: "2026-03-01", open: false }),
        p({ kind: "adoption", startDate: "2026-03-01", personId: "p3", personName: "Ion" }),
        p({ animalId: "d", startDate: null, endDate: "2026-04-10", open: false, deathDate: "2026-04-10" }),
        p({ animalId: "e", startDate: "2025-10-01", endDate: "2026-05-01", open: false }),
        p({ animalId: "f", endDate: "2026-08-01", open: false }),
      ],
      [], FROM, TO, TODAY,
    );
    expect(s.stays.map((r) => [r.end, r.outcome, r.days])).toEqual([["2026-03-01", "adopted", 28], ["2026-04-10", "died", null], ["2026-05-01", "other", 212]]);
    expect(s.endedInAdoption).toBe(1);
    expect(s.endedStay).toMatchObject({ n: 2, median: 120 });
    expect(s.activeFosters).toEqual([]);
  });

  it("lists adoptions that came back, but not a foster-adoption that became an adoption", () => {
    const s = summarizeFosters(
      [
        p({ kind: "adoption", startDate: "2026-02-01", endDate: "2026-03-10", open: false, personName: "Ion" }),
        p({ animalId: "g", kind: "foster_adoption", startDate: "2026-02-01", endDate: "2026-04-01", open: false }),
        p({ animalId: "g", kind: "adoption", startDate: "2026-04-01" }),
      ],
      [], FROM, TO, TODAY,
    );
    expect(s.returns).toEqual([{ animal: "Mitzi", person: "Ion", personErased: false, kind: "adoption", start: "2026-02-01", end: "2026-03-10" }]);
  });

  it("counts open adoption cases by stage, oldest and overdue first", () => {
    const s = summarizeFosters([], [
      c({ animalName: "A", openedOn: "2026-06-21" }),
      c({ animalName: "B", stage: "to_verify", openedOn: "2026-05-01", nextStepOn: "2026-06-30" }),
      c({ animalName: "C", stage: "external", openedOn: "2026-04-01" }),
      c({ animalName: "D", stage: "done", openedOn: "2026-01-01" }),
    ], FROM, TO, TODAY);
    expect(s.casesByStage).toEqual({ paperwork: 1, to_verify: 1, external: 1 });
    expect(s.openCases.map((x) => [x.animalName, x.ageDays, x.overdue])).toEqual([["B", 61, true], ["C", 91, false], ["A", 10, false]]);
    expect(s.overdueCases).toBe(1);
    expect(s.caseAge?.median).toBe(61);
  });
});
