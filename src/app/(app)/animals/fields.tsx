import { Field, inputCls } from "@/components/ui";
import type { T } from "@/i18n";

export type AnimalFormValues = Partial<{
  name: string; species: string; sex: string; color: string | null; birthDate: string | null; intakeDate: string | null;
  sterilized: string; healthBookNo: string | null; microchip: string | null; passport: string | null;
  currentTreatment: string | null; intakeHistory: string | null; medicalSummary: string | null;
  otherInfo: string | null; locationNote: string | null;
}>;

export function AnimalFields({ t, values = {} }: { t: T; values?: AnimalFormValues }) {
  const input = (label: string, name: keyof AnimalFormValues, type = "text") => (
    <Field label={label}><input className={inputCls} type={type} name={name} defaultValue={values[name] ?? ""} required={name === "name"} /></Field>
  );
  const area = (label: string, name: keyof AnimalFormValues) => (
    <div className="sm:col-span-2 lg:col-span-3">
      <Field label={label}><textarea className={inputCls} rows={3} name={name} defaultValue={values[name] ?? ""} /></Field>
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {input(t("common.name"), "name")}
      <Field label={t("animals.species")}>
        <select className={inputCls} name="species" defaultValue={values.species ?? "cat"}>
          <option value="cat">{t("animals.cat")}</option><option value="dog">{t("animals.dog")}</option>
        </select>
      </Field>
      <Field label={t("animals.sex")}>
        <select className={inputCls} name="sex" defaultValue={values.sex ?? "unknown"}>
          <option value="unknown">{t("common.unknown")}</option><option value="f">{t("animals.female")}</option><option value="m">{t("animals.male")}</option>
        </select>
      </Field>
      {input(t("animals.color"), "color")}
      {input(t("animals.birth"), "birthDate", "date")}
      {input(t("animals.intake"), "intakeDate", "date")}
      <Field label={t("animals.sterilized")}>
        <select className={inputCls} name="sterilized" defaultValue={values.sterilized ?? "unknown"}>
          <option value="unknown">{t("common.unknown")}</option><option value="yes">{t("common.yes")}</option><option value="no">{t("common.no")}</option>
        </select>
      </Field>
      {input(t("animals.book"), "healthBookNo")}
      {input(t("animals.chip"), "microchip")}
      {input(t("animals.passport"), "passport")}
      {area(t("animals.location"), "locationNote")}
      {area(t("animals.treatment"), "currentTreatment")}
      {area(t("animals.history"), "intakeHistory")}
      {area(t("animals.summary"), "medicalSummary")}
      {area(t("animals.other"), "otherInfo")}
    </div>
  );
}
