import { describe, expect, it } from "vitest";
import {
  addMonths,
  ageInMonths,
  spanParts,
  extractDate,
  parseCellDate,
  parseDayMonth,
  parseYearMonthNumber,
  splitEntries,
} from "../src/lib/dates";

describe("spreadsheet numbers", () => {
  it("reads a two-digit month", () => {
    expect(parseYearMonthNumber(2026.06)).toEqual({ date: "2026-06-01", precision: "month" });
  });
  it("reads 2026.1 as October, because Excel dropped the trailing zero of 2026.10", () => {
    expect(parseYearMonthNumber(2026.1)).toEqual({ date: "2026-10-01", precision: "month" });
  });
  it("reads a whole number as a year", () => {
    expect(parseYearMonthNumber(2022)).toEqual({ date: "2022-01-01", precision: "year" });
  });
  it("rejects a single decimal that cannot be a month", () => {
    expect(parseYearMonthNumber(2026.2)).toBeNull();
  });
});

describe("text dates found in the workbook", () => {
  it.each([
    ["2026.08.15", "2026-08-15", "day"],
    ["04.11.2026", "2026-11-04", "day"],
    ["12.01.26", "2026-01-12", "day"],
    ["2025-12-01", "2025-12-01", "day"],
    ["6.03.2025", "2025-03-06", "day"],
    ["mai 2022?", "2022-05-01", "month"],
    ["ian 2022", "2022-01-01", "month"],
    ["2025 noi", "2025-11-01", "month"],
    ["2026. apr neg", "2026-04-01", "month"],
    ["Ianuarie 2023", "2023-01-01", "month"],
    ["vara 2021", "2021-01-01", "year"],
    ["<2018", "2018-01-01", "year"],
    ["?2013", "2013-01-01", "year"],
    ["14 Aug 2023 panleuco", "2023-08-14", "day"],
  ])("%s", (input, date, precision) => {
    expect(extractDate(input)).toMatchObject({ date, precision });
  });

  it("does not invent a date from the typo 19.101.2026", () => {
    expect(extractDate("19.101.2026")).toBeNull();
  });
  it("rejects an impossible day", () => {
    expect(extractDate("31.02.2026")).toBeNull();
  });
  it("returns nothing for words with no date", () => {
    expect(extractDate("dupa 1 oct")).toBeNull();
  });
  it("keeps the words around the date", () => {
    expect(extractDate("2026.10.29 Vanelli (Fipronil)")?.rest).toBe("Vanelli (Fipronil)");
    expect(extractDate("poz 25.04.2024")?.rest).toBe("poz");
  });
  it("reads a Date cell as a full day", () => {
    expect(parseCellDate(new Date("2026-10-31T00:00:00Z"))).toEqual({ date: "2026-10-31", precision: "day" });
  });
});

describe("splitEntries", () => {
  it("splits lines", () => {
    expect(splitEntries("2026.08.21 drontal\n2026.10.29 Biheldon")).toEqual(["2026.08.21 drontal", "2026.10.29 Biheldon"]);
  });
  it("splits comma lists of dates", () => {
    expect(splitEntries("2026-08-31,2026-09-22")).toEqual(["2026-08-31", "2026-09-22"]);
  });
  it("keeps commas inside prose", () => {
    expect(splitEntries("insuficienta renala, pancreatita")).toEqual(["insuficienta renala, pancreatita"]);
  });
});

describe("parseDayMonth", () => {
  it("reads the number 30.06", () => expect(parseDayMonth(30.06, 2026)).toBe("2026-06-30"));
  it("restores the zero in the number 30.1", () => expect(parseDayMonth(30.1, 2026)).toBe("2026-10-30"));
  it("reads day and month before words", () => expect(parseDayMonth("06.07 (luni II)", 2026)).toBe("2026-07-06"));
  it("takes the last date in a range", () => expect(parseDayMonth("(26 sept) - 27sep", 2026)).toBe("2026-09-27"));
  it("returns null for a sentence", () => expect(parseDayMonth("nu ne-a confirmat", 2026)).toBeNull());
});

describe("ageInMonths", () => {
  it("counts completed months", () => {
    expect(ageInMonths("2026-06-15", "2026-11-08")).toBe(4);
    expect(ageInMonths("2026-06-01", "2026-11-08")).toBe(5);
  });
  it("is null without a date or for a future date", () => {
    expect(ageInMonths(null, "2026-11-08")).toBeNull();
    expect(ageInMonths("2027-01-01", "2026-11-08")).toBeNull();
  });
});

describe("addMonths", () => {
  it("clamps to the end of a shorter month", () => expect(addMonths("2026-08-31", 6)).toBe("2027-02-28"));
});

describe("spanParts", () => {
  it("counts days below one month", () => {
    expect(spanParts("2026-11-01", "2026-11-13")).toEqual({ years: 0, months: 0, days: 12 });
    expect(spanParts("2026-10-20", "2026-11-10")).toEqual({ years: 0, months: 0, days: 21 });
  });

  it("counts whole months and years from one calendar date to the other", () => {
    expect(spanParts("2025-07-18", "2026-11-10")).toEqual({ years: 1, months: 3, days: 0 });
    expect(spanParts("2025-07-10", "2026-11-10")).toEqual({ years: 1, months: 4, days: 0 });
    expect(spanParts("2023-12-27", "2026-11-10")).toEqual({ years: 2, months: 10, days: 0 });
    expect(spanParts("2025-11-10", "2026-11-10")).toEqual({ years: 1, months: 0, days: 0 });
  });

  it("never goes below zero", () => {
    expect(spanParts("2026-11-12", "2026-11-10")).toEqual({ years: 0, months: 0, days: 0 });
  });
});
