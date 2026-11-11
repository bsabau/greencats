import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { toXlsx } from "../src/lib/xlsx";

async function read(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

describe("toXlsx", () => {
  it("writes one sheet per table with a bold header", async () => {
    const wb = await read(await toXlsx([
      { name: "Lunar", headers: ["luna", "intrări"], rows: [["2026-01", 4]] },
      { name: "a/very:long*sheet?name that goes past the limit", headers: ["x"], rows: [] },
    ]));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Lunar", "a very long sheet name that goe"]);
    const ws = wb.getWorksheet("Lunar")!;
    expect(ws.getRow(1).values).toEqual([undefined, "luna", "intrări"]);
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.getCell("B2").value).toBe(4);
  });

  it("writes ISO dates as real dates", async () => {
    const wb = await read(await toXlsx([{ name: "d", headers: ["on"], rows: [["2026-03-15"], [null]] }]));
    const value = wb.worksheets[0].getCell("A2").value;
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).toISOString().slice(0, 10)).toBe("2026-03-15");
    expect(wb.worksheets[0].getCell("A3").value).toBeNull();
  });

  it("keeps text that looks like a formula as text", async () => {
    const wb = await read(await toXlsx([{ name: "t", headers: ["name"], rows: [["=1+1"], ["@SUM(A1)"]] }]));
    expect(wb.worksheets[0].getCell("A2").value).toBe("=1+1");
    expect(wb.worksheets[0].getCell("A2").type).toBe(ExcelJS.ValueType.String);
    expect(wb.worksheets[0].getCell("A3").value).toBe("@SUM(A1)");
  });
});
