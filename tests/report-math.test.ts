import { describe, expect, it } from "vitest";
import { ageBand, fuzzySpan, monthsInRange, placeInRange, quantile, spread, stayDays } from "../src/lib/report-math";

describe("approximate dates against a range", () => {
  it("spans the whole month or year", () => {
    expect(fuzzySpan("2024-02-01", "month")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(fuzzySpan("2024-01-01", "year")).toEqual({ start: "2024-01-01", end: "2024-12-31" });
    expect(fuzzySpan("2024-05-17", null)).toEqual({ start: "2024-05-17", end: "2024-05-17" });
  });
  it("is in, out, or uncertain", () => {
    expect(placeInRange("2025-03-01", "month", "2025-01-01", "2025-12-31")).toBe("in");
    expect(placeInRange("2025-01-01", "year", "2025-01-01", "2025-12-31")).toBe("in");
    expect(placeInRange("2025-01-01", "year", "2025-01-01", "2025-06-30")).toBe("uncertain");
    expect(placeInRange("2025-03-01", "month", "2025-03-15", "2025-04-30")).toBe("uncertain");
    expect(placeInRange("2024-12-01", "month", "2025-01-01", "2025-12-31")).toBe("out");
    expect(placeInRange(null, "day", "2025-01-01", "2025-12-31")).toBe("out");
  });
});

describe("monthsInRange", () => {
  it("lists each month once, across years", () => {
    expect(monthsInRange("2025-11-15", "2026-02-03")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsInRange("2026-03-31", "2026-03-31")).toEqual(["2026-03"]);
  });
});

describe("spread", () => {
  it("interpolates quartiles", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(spread([40, 10, 30, 20])).toEqual({ n: 4, median: 25, p25: 18, p75: 33 });
  });
  it("is null with nothing to measure", () => {
    expect(spread([])).toBeNull();
  });
});

describe("ageBand", () => {
  it("splits at 6 months, 2 years and 8 years", () => {
    expect(ageBand("2026-01-01", "2026-06-30")).toBe("kitten");
    expect(ageBand("2026-01-01", "2026-07-01")).toBe("junior");
    expect(ageBand("2024-01-01", "2026-01-01")).toBe("adult");
    expect(ageBand("2018-01-01", "2026-01-01")).toBe("senior");
    expect(ageBand(null, "2026-01-01")).toBe("unknown");
  });
});

describe("stayDays", () => {
  it("counts days from a known intake", () => {
    expect(stayDays("2026-01-01", "day", "2026-03-01")).toBe(59);
  });
  it("counts a month-only intake from the middle of the month", () => {
    expect(stayDays("2026-01-01", "month", "2026-02-15")).toBe(31);
    expect(stayDays("2026-01-01", "month", "2026-01-03")).toBe(0);
  });
  it("won't measure from a year-only or missing intake, or backwards", () => {
    expect(stayDays("2026-01-01", "year", "2026-06-01")).toBeNull();
    expect(stayDays(null, "day", "2026-06-01")).toBeNull();
    expect(stayDays("2026-06-01", "day", "2026-05-01")).toBeNull();
  });
});
