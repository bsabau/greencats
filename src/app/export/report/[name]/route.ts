import { fosterTables, getFosterReport } from "@/domain/report-fosters";
import { getMedicalReport, medicalTables } from "@/domain/report-medical";
import { getPeriodReport, periodTables } from "@/domain/report-period";
import { getShiftReport, shiftTables } from "@/domain/report-shifts";
import { getI18n, type T } from "@/i18n";
import { audit, currentUser, type User } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { todayIso } from "@/lib/dates";
import { parseReportFilters, type ReportFilters } from "@/lib/report-filters";
import { toXlsx, type ReportTable } from "@/lib/xlsx";

export const dynamic = "force-dynamic";

/** Each report builds the same tables its page shows, so a download always matches the screen. */
const REPORTS: Record<string, (user: User, filters: ReportFilters, t: T) => Promise<ReportTable[]>> = {
  period: async (_user, f, t) => periodTables(await getPeriodReport(f), t),
  medical: async (_user, f, t) => medicalTables(await getMedicalReport(f), t),
  fosters: async (user, f, t) => fosterTables(await getFosterReport(user, f, todayIso()), user, t),
  shifts: async (user, f, t) => shiftTables(await getShiftReport(user, f, todayIso()), t),
};

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("Unauthorized", { status: 401 });
  const { name } = await params;
  const build = Object.hasOwn(REPORTS, name) ? REPORTS[name] : undefined;
  if (!build) return new Response("Not found", { status: 404 });

  const query = new URL(req.url).searchParams;
  const filters = parseReportFilters(query);
  const format = query.get("format") === "csv" ? "csv" : "xlsx";
  const { t } = await getI18n();
  const all = await build(user, filters, t);
  const tables = format === "csv" ? all.filter((tbl) => tbl.key === query.get("table")) : all;
  if (tables.length === 0) return new Response("Not found", { status: 404 });

  await audit(user.id, `export.report.${name}`, "report", null, {
    format, table: format === "csv" ? tables[0].key : null, from: filters.from, to: filters.to,
    species: filters.species, sex: filters.sex, location: filters.location, clinic: filters.clinic,
    rows: tables.reduce((n, tbl) => n + tbl.rows.length, 0),
  });

  const base = `greencats-${name}${format === "csv" ? `-${tables[0].key}` : ""}-${filters.from}_${filters.to}`;
  const body = format === "csv" ? toCsv(tables[0].headers, tables[0].rows) : new Uint8Array(await toXlsx(tables.map((tbl) => ({ name: tbl.label, headers: tbl.headers, rows: tbl.rows }))));
  return new Response(body, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : XLSX,
      "Content-Disposition": `attachment; filename="${base}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
