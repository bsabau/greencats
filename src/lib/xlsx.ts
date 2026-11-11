import ExcelJS from "exceljs";

export type Cell = string | number | null | undefined;
export type Sheet = { name: string; headers: string[]; rows: Cell[][] };
/** A report table: shown on a page, and downloaded as a CSV file or an Excel sheet. */
export type ReportTable = { key: string; label: string; headers: string[]; rows: Cell[][] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WIDTH = 50;

/**
 * An Excel workbook with one sheet per table. ISO dates become real dates so they sort and
 * filter in Excel. Text is always written as text, so a value starting with "=" is never a formula.
 */
export async function toXlsx(sheets: Sheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "greencats";
  for (const sheet of sheets) {
    // Excel limits sheet names to 31 characters and forbids a few symbols.
    const ws = wb.addWorksheet(sheet.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(sheet.headers).font = { bold: true };
    for (const row of sheet.rows) {
      ws.addRow(row.map((v) => (typeof v === "string" && ISO_DATE.test(v) ? new Date(`${v}T00:00:00Z`) : (v ?? null))));
    }
    ws.columns.forEach((col, i) => {
      const lengths = [sheet.headers[i] ?? "", ...sheet.rows.map((r) => String(r[i] ?? ""))].map((s) => s.length);
      col.width = Math.min(MAX_WIDTH, Math.max(10, ...lengths) + 2);
      if (sheet.rows.some((r) => typeof r[i] === "string" && ISO_DATE.test(r[i] as string))) col.numFmt = "yyyy-mm-dd";
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
