import { describe, expect, it } from "vitest";
import { filterQuery, parseReportFilters, presetRange } from "../src/lib/report-filters";

const TODAY = "2026-11-11";
const UUID = "3f1c2a9e-8b7d-4c6e-9a1b-2c3d4e5f6a7b";

describe("presets", () => {
  it("covers the calendar ranges people ask for", () => {
    expect(presetRange("this_month", TODAY)).toEqual({ from: "2026-11-01", to: TODAY });
    expect(presetRange("last_month", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("this_year", TODAY)).toEqual({ from: "2026-01-01", to: TODAY });
    expect(presetRange("last_year", TODAY)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(presetRange("last_12_months", TODAY)).toEqual({ from: "2025-12-01", to: TODAY });
  });
  it("handles last month across a year boundary", () => {
    expect(presetRange("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});

describe("parseReportFilters", () => {
  it("defaults to this year with no filters", () => {
    expect(parseReportFilters({}, TODAY)).toEqual({
      from: "2026-01-01", to: TODAY, preset: "this_year", species: null, sex: null, location: null, clinic: null,
    });
  });
  it("reads a typed range and every filter", () => {
    const f = parseReportFilters(new URLSearchParams({ from: "2025-03-01", to: "2025-06-30", species: "cat", sex: "f", location: UUID, clinic: UUID }), TODAY);
    expect(f).toEqual({ from: "2025-03-01", to: "2025-06-30", preset: null, species: "cat", sex: "f", location: UUID, clinic: UUID });
  });
  it("lets a preset win over typed dates", () => {
    expect(parseReportFilters({ preset: "last_year", from: "2020-01-01", to: "2020-02-01" }, TODAY)).toMatchObject({ from: "2025-01-01", to: "2025-12-31", preset: "last_year" });
  });
  it("falls back to the default for bad or half values", () => {
    for (const params of [{ from: "2025-02-30", to: "2025-03-01" }, { from: "2025-01-01" }, { preset: "forever" }, { from: "yesterday", to: "today" }]) {
      expect(parseReportFilters(params, TODAY)).toMatchObject({ from: "2026-01-01", to: TODAY, preset: "this_year" });
    }
  });
  it("drops filters it can't read instead of failing", () => {
    expect(parseReportFilters({ species: "horse", sex: "", location: "1; drop table", clinic: ["nope"] }, TODAY)).toMatchObject({
      species: null, sex: null, location: null, clinic: null,
    });
  });
  it("takes the first value when a parameter repeats", () => {
    expect(parseReportFilters({ species: ["dog", "cat"] }, TODAY).species).toBe("dog");
  });
  it("swaps a reversed range", () => {
    expect(parseReportFilters({ from: "2025-06-30", to: "2025-03-01" }, TODAY)).toMatchObject({ from: "2025-03-01", to: "2025-06-30" });
  });
  it("caps the range at ten years", () => {
    expect(parseReportFilters({ from: "1990-01-01", to: "2026-06-30" }, TODAY)).toMatchObject({ from: "2016-06-30", to: "2026-06-30" });
  });
});

describe("filterQuery", () => {
  it("keeps a preset as a preset, so a saved link keeps moving with time", () => {
    expect(filterQuery(parseReportFilters({ preset: "this_month", species: "cat" }, TODAY))).toBe("preset=this_month&species=cat");
  });
  it("writes a typed range and extra values", () => {
    expect(filterQuery(parseReportFilters({ from: "2025-01-01", to: "2025-01-31" }, TODAY), { format: "xlsx" })).toBe("from=2025-01-01&to=2025-01-31&format=xlsx");
  });
});
