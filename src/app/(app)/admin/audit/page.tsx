import { desc, eq } from "drizzle-orm";
import { Card, Page, Table, Td, Th } from "@/components/ui";
import { db, schema as s } from "@/db";
import { getI18n } from "@/i18n";
import { requirePermission } from "@/lib/auth";

const LIMIT = 300;

export default async function AuditPage() {
  await requirePermission("audit:view");
  const { t, fmtDateTime } = await getI18n();
  const rows = await db
    .select({ log: s.auditLog, who: s.users.name })
    .from(s.auditLog)
    .leftJoin(s.users, eq(s.users.id, s.auditLog.userId))
    .orderBy(desc(s.auditLog.createdAt))
    .limit(LIMIT);
  return (
    <Page title={t("audit.title")}>
      <Card>
        <Table>
          <thead><tr><Th>{t("audit.when")}</Th><Th>{t("audit.who")}</Th><Th>{t("audit.action")}</Th><Th>{t("audit.detail")}</Th></tr></thead>
          <tbody>
            {rows.map(({ log, who }) => (
              <tr key={log.id}>
                <Td>{fmtDateTime(log.createdAt)}</Td>
                <Td>{who ?? t("common.none")}</Td>
                <Td>{log.action}</Td>
                <Td><span className="break-all text-xs text-stone-600">{log.detail ? JSON.stringify(log.detail).slice(0, 200) : ""}</span></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </Page>
  );
}
