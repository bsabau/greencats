import { describe, expect, it } from "vitest";
import { toCsv } from "../src/lib/csv";

describe("toCsv", () => {
  it("quotes commas and quotes", () => {
    expect(toCsv(["a"], [['x, "y"']])).toBe('﻿a\r\n"x, ""y"""\r\n');
  });
  it("neutralises spreadsheet formulas", () => {
    expect(toCsv(["a"], [["=HYPERLINK(1)"]])).toBe("﻿a\r\n'=HYPERLINK(1)\r\n");
  });
  it("leaves numbers alone", () => {
    expect(toCsv(["a"], [[-3]])).toBe("﻿a\r\n-3\r\n");
  });
  it("renders missing values as empty", () => {
    expect(toCsv(["a", "b"], [[null, undefined]])).toBe("﻿a,b\r\n,\r\n");
  });
});
