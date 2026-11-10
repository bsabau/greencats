import { Field, inputCls } from "@/components/ui";
import { schema as s } from "@/db";
import type { Key, T } from "@/i18n";

type Values = Partial<{ name: string; phones: string[]; email: string | null; address: string | null; notes: string | null; fosterRating: string; externalCase: boolean; consentNote: string | null }>;

export function PersonFields({ t, values = {} }: { t: T; values?: Values }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("common.name")}><input className={inputCls} name="name" defaultValue={values.name ?? ""} required /></Field>
      <Field label={t("people.phones")} help={t("people.phonesHelp")}><input className={inputCls} name="phones" defaultValue={values.phones?.join(", ") ?? ""} /></Field>
      <Field label={t("people.email")}><input className={inputCls} type="email" name="email" defaultValue={values.email ?? ""} /></Field>
      <Field label={t("people.address")}><input className={inputCls} name="address" defaultValue={values.address ?? ""} /></Field>
      <Field label={t("people.rating")}>
        <select className={inputCls} name="fosterRating" defaultValue={values.fosterRating ?? "unrated"}>
          {s.fosterRatingEnum.enumValues.map((r) => <option key={r} value={r}>{t(`rating.${r}` as Key)}</option>)}
        </select>
      </Field>
      <label className="flex items-center gap-2 pt-6 text-sm text-stone-700"><input type="checkbox" name="externalCase" defaultChecked={values.externalCase ?? false} />{t("people.external")}</label>
      <div className="sm:col-span-2"><Field label={t("people.consent")} help={t("people.consentHelp")}><input className={inputCls} name="consentNote" defaultValue={values.consentNote ?? ""} /></Field></div>
      <div className="sm:col-span-2"><Field label={t("common.notes")}><textarea className={inputCls} rows={3} name="notes" defaultValue={values.notes ?? ""} /></Field></div>
    </div>
  );
}
