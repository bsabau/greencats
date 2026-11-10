import { SubmitButton } from "@/components/client";
import { asc } from "drizzle-orm";
import type { ReactNode } from "react";
import { saveAdoption } from "@/app/actions";
import { Badge, Card, Field, Flash, Page, btn, btnGhost, inputCls } from "@/components/ui";
import { db, schema as s } from "@/db";
import { getI18n, type Key, type T } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { can, hideMicrochip, redactFields } from "@/lib/permissions";

type Row = typeof s.adoptionCases.$inferSelect;

function AdoptionForm({ t, row, action, children }: { t: T; row?: Row; action: (fd: FormData) => Promise<void>; children: ReactNode }) {
  const input = (label: string, name: keyof Row, type = "text") => (
    <Field label={label}><input className={inputCls} type={type} name={name} defaultValue={(row?.[name] as string | null) ?? ""} required={name === "animalName"} /></Field>
  );
  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {input(t("ad.animal"), "animalName")}
      {input(t("ad.adopter"), "adopterName")}
      <Field label={t("ad.stage")}>
        <select className={inputCls} name="stage" defaultValue={row?.stage ?? "paperwork"}>
          {s.adoptionStageEnum.enumValues.map((v) => <option key={v} value={v}>{t(`stage.${v}` as Key)}</option>)}
        </select>
      </Field>
      {input(t("ad.book"), "healthBook")}
      {input(t("ad.contract"), "contractNo")}
      {input(t("ad.vaccine"), "vaccine")}
      {input(t("ad.chip"), "microchip")}
      {input(t("ad.passport"), "passport")}
      {input(t("ad.nextStep"), "nextStepOn", "date")}
      {input(t("ad.statusNote"), "statusNote")}
      <div className="sm:col-span-2">{input(t("common.notes"), "notes")}</div>
      <div>{children}</div>
    </form>
  );
}

type DocState = "done" | "missing" | "na";

/** Reads the team's free-text cell: "nu e nevoie" means not required, "nu" or empty means still to do. */
function docState(value: string | null): DocState {
  const v = (value ?? "").trim().toLowerCase();
  if (v.startsWith("nu e nevoie")) return "na";
  if (!v || v === "nu" || v === "no") return "missing";
  return "done";
}

function PaperworkChecklist({ t, items }: { t: T; items: [string, string | null][] }) {
  const states = items.map(([label, value]) => ({ label, value, state: docState(value) }));
  const required = states.filter((d) => d.state !== "na");
  const done = required.filter((d) => d.state === "done").length;
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-stone-600">{t("ad.progress", { done, total: required.length })}</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {states.map((d) => (
          <li key={d.label} title={d.value ?? t("ad.missing")}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${d.state === "done" ? "bg-brand-100 text-brand-900" : d.state === "na" ? "bg-stone-100 text-stone-500" : "bg-amber-100 text-amber-900"}`}>
            <span aria-hidden>{d.state === "done" ? "✓" : d.state === "na" ? "–" : "○"}</span>
            {d.label}{d.state === "na" ? ` (${t("ad.na")})` : d.state === "missing" ? ` (${t("ad.missing")})` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function AdoptionsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requireUser();
  const { t, fmtDate } = await getI18n();
  const rows = (await db.select().from(s.adoptionCases).orderBy(asc(s.adoptionCases.animalName))).map((r) =>
    ({ ...redactFields(user, r, ["animalName", "adopterName", "healthBook", "contractNo", "vaccine", "microchip", "passport", "notes", "statusNote"]), microchip: docState(r.microchip) === "done" ? hideMicrochip(user, r.microchip) : r.microchip }));
  const editable = can(user, "adoptions:edit");
  const none = t("common.none");
  return (
    <Page title={t("ad.title")}>
      <Flash params={await searchParams} t={t} />
      {editable && (
        <Card>
          <details>
            <summary className={`${btn} list-none`}>{t("ad.new")}</summary>
            <AdoptionForm t={t} action={saveAdoption.bind(null, null)}><SubmitButton>{t("common.save")}</SubmitButton></AdoptionForm>
          </details>
        </Card>
      )}
      {s.adoptionStageEnum.enumValues.map((stage) => {
        const inStage = rows.filter((r) => r.stage === stage);
        if (inStage.length === 0) return null;
        return (
          <Card key={stage} title={`${t(`stage.${stage}` as Key)} (${inStage.length})`}>
            <ul className="divide-y divide-stone-100">
              {inStage.map((r) => (
                <li key={r.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-medium text-stone-900">{r.animalName}</span>
                    <span className="text-stone-700">{r.adopterName ?? none}</span>
                    {r.nextStepOn && <Badge tone="amber">{t("ad.nextStep")}: {fmtDate(r.nextStepOn)}</Badge>}
                  </div>
                  <PaperworkChecklist t={t} items={[[t("ad.book"), r.healthBook], [t("ad.contract"), r.contractNo], [t("ad.vaccine"), r.vaccine], [t("ad.chip"), r.microchip], [t("ad.passport"), r.passport]]} />
                  {(r.notes || r.statusNote) && <p className="mt-1 text-stone-600">{[r.statusNote, r.notes].filter(Boolean).join(" · ")}</p>}
                  {editable && (
                    <details className="mt-2">
                      <summary className={`${btnGhost} list-none`}>{t("common.edit")}</summary>
                      <AdoptionForm t={t} row={r} action={saveAdoption.bind(null, r.id)}><SubmitButton>{t("common.save")}</SubmitButton></AdoptionForm>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </Page>
  );
}
