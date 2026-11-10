/** Builds CSV that opens safely in Excel. A BOM keeps diacritics intact. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    let v = value === null || value === undefined ? "" : String(value);
    // A leading = + - @ would run as a formula when the file is opened in a spreadsheet.
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
    return /[",\r\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
