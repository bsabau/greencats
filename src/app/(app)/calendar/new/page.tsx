import { Combobox, SubmitButton } from "@/components/client";
import { asc, inArray } from "drizzle-orm";
import { createEvent } from "@/app/actions";
import { Card, Field, Flash, Page, btn, inputCls } from "@/components/ui";
import { db, schema as s } from "@/db";
import { CARE_STATUSES } from "@/domain/due";
import { getI18n, type Key } from "@/i18n";
import { requirePermission } from "@/lib/auth";
import { todayIso } from "@/lib/dates";

export default async function NewEvent({ searchParams }: { searchParams: Promise<{ date?: string; error?: string }> }) {
  await requirePermission("calendar:edit");
  const { t } = await getI18n();
  const params = await searchParams;
  const animals = await db
    .select({ id: s.animals.id, name: s.animals.name })
    .from(s.animals)
    .where(inArray(s.animals.status, [...CARE_STATUSES]))
    .orderBy(asc(s.animals.name));
  return (
    <Page title={t("cal.new")}>
      <Flash params={params} t={t} />
      <Card>
        <form action={createEvent} className="grid gap-3 sm:grid-cols-2">
          <Field label={t("cal.eventTitle")}><input className={inputCls} name="title" required /></Field>
          <Field label={t("cal.type")}>
            <select className={inputCls} name="type" defaultValue="shift">
              {s.eventTypeEnum.enumValues.map((v) => <option key={v} value={v}>{t(`event.${v}` as Key)}</option>)}
            </select>
          </Field>
          <Field label={t("cal.start")}><input className={inputCls} type="date" name="startOn" defaultValue={params.date ?? todayIso()} required /></Field>
          <Field label={t("cal.end")}><input className={inputCls} type="date" name="endOn" /></Field>
          <Field label={t("cal.startTime")}><input className={inputCls} type="time" name="startTime" /></Field>
          <Field label={t("cal.endTime")}><input className={inputCls} type="time" name="endTime" /></Field>
          <Field label={t("cal.capacity")}><input className={inputCls} type="number" min={1} max={50} name="capacity" /></Field>
          <Field label={t("cal.repeat")}><input className={inputCls} type="number" min={0} max={26} name="repeat" defaultValue={0} /></Field>
          <Field label={t("cal.animal")}>
            <Combobox name="animalId" options={animals} placeholder={t("common.search")} emptyLabel={t("search.none")} inputClass={inputCls} />
          </Field>
          <div className="sm:col-span-2"><Field label={t("common.notes")}><textarea className={inputCls} rows={3} name="notes" /></Field></div>
          <div><SubmitButton>{t("common.save")}</SubmitButton></div>
        </form>
      </Card>
    </Page>
  );
}
