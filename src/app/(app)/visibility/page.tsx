import { SubmitButton } from "@/components/client";
import { asc } from "drizzle-orm";
import type { ReactNode } from "react";
import { saveVisibility } from "@/app/actions";
import { Badge, Card, Empty, Field, Flash, Page, btn, btnGhost, inputCls } from "@/components/ui";
import { db, schema as s } from "@/db";
import { getI18n, type T } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { can, redactFields } from "@/lib/permissions";

type Row = typeof s.visibilityCases.$inferSelect;
const isYes = (v: string | null) => /^(da|yes)/i.test(v ?? "");

function VisibilityForm({ t, row, action, children }: { t: T; row?: Row; action: (fd: FormData) => Promise<void>; children: ReactNode }) {
  const input = (label: string, name: keyof Row) => (
    <Field label={label}><input className={inputCls} name={name} defaultValue={(row?.[name] as string | null) ?? ""} required={name === "animalName"} /></Field>
  );
  const area = (label: string, name: keyof Row) => (
    <div className="sm:col-span-2 lg:col-span-3"><Field label={label}><textarea className={inputCls} rows={4} name={name} defaultValue={(row?.[name] as string | null) ?? ""} /></Field></div>
  );
  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {input(t("vis.animal"), "animalName")}
      {input(t("vis.contact"), "contactName")}
      {input(t("vis.photos"), "photosRef")}
      {input(t("vis.contract"), "contractReceived")}
      {input(t("vis.ready"), "readyForSite")}
      {input(t("vis.onSite"), "onSite")}
      {input(t("vis.interested"), "interestedPerson")}
      {input(t("vis.details"), "details")}
      {input(t("vis.extra"), "extra")}
      {area(t("vis.sheet"), "infoSheet")}
      {area(t("vis.description"), "description")}
      <div>{children}</div>
    </form>
  );
}

export default async function VisibilityPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requireUser();
  const { t } = await getI18n();
  const editable = can(user, "visibility:edit");
  // The case owner edits these fields, so only read-only viewers get the redacted text.
  const rows = (await db.select().from(s.visibilityCases).orderBy(asc(s.visibilityCases.animalName))).map((r) =>
    editable ? r : redactFields(user, r, ["animalName", "contactName", "photosRef", "contractReceived", "readyForSite", "onSite", "interestedPerson", "details", "infoSheet", "description", "extra"]));
  return (
    <Page title={t("vis.title")}>
      <Flash params={await searchParams} t={t} />
      {editable && (
        <Card>
          <details>
            <summary className={`${btn} list-none`}>{t("vis.new")}</summary>
            <VisibilityForm t={t} action={saveVisibility.bind(null, null)}><SubmitButton>{t("common.save")}</SubmitButton></VisibilityForm>
          </details>
        </Card>
      )}
      <Card>
        {rows.length === 0 ? <Empty t={t} /> : (
          <ul className="divide-y divide-stone-100">
            {rows.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-stone-900">{r.animalName}</span>
                  {r.contactName && <span className="text-stone-600">{r.contactName}</span>}
                  {isYes(r.onSite) && <Badge tone="green">{t("vis.onSite")}</Badge>}
                  {isYes(r.readyForSite) && !isYes(r.onSite) && <Badge tone="amber">{t("vis.ready")}</Badge>}
                </div>
                {r.details && <p className="mt-1 text-stone-600">{r.details}</p>}
                <details className="mt-2">
                  <summary className={`${btnGhost} list-none`}>{editable ? t("common.edit") : t("animals.details")}</summary>
                  {editable
                    ? <VisibilityForm t={t} row={r} action={saveVisibility.bind(null, r.id)}><SubmitButton>{t("common.save")}</SubmitButton></VisibilityForm>
                    : <p className="mt-2 whitespace-pre-wrap text-stone-700">{[r.infoSheet, r.description].filter(Boolean).join("\n\n")}</p>}
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}
