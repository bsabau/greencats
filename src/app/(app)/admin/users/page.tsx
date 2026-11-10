import { ConfirmDelete, SubmitButton } from "@/components/client";
import { asc } from "drizzle-orm";
import { createUser, deleteUser, updateUser } from "@/app/actions";
import { Card, Field, Flash, Page, btn, btnGhost, inputCls } from "@/components/ui";
import { db, schema as s } from "@/db";
import { getI18n, type Key } from "@/i18n";
import { requirePermission } from "@/lib/auth";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const me = await requirePermission("users:manage");
  const { t } = await getI18n();
  const users = await db.select().from(s.users).orderBy(asc(s.users.name));
  const check = (name: string, label: string, on = false) => (
    <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" name={name} defaultChecked={on} />{label}</label>
  );
  return (
    <Page title={t("users.title")}>
      <Flash params={await searchParams} t={t} />
      <Card title={t("users.new")}>
        <form action={createUser} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("common.name")}><input className={inputCls} name="name" required /></Field>
          <Field label={t("login.email")}><input className={inputCls} type="email" name="email" required /></Field>
          <Field label={t("users.tempPassword")}><input className={inputCls} type="password" name="password" minLength={12} autoComplete="new-password" required /></Field>
          <Field label={t("users.role")}>
            <select className={inputCls} name="role" defaultValue="volunteer">
              {s.roleEnum.enumValues.map((r) => <option key={r} value={r}>{t(`role.${r}` as Key)}</option>)}
            </select>
          </Field>
          {check("ownsAdoptions", t("users.ownsAdoptions"))}
          {check("ownsVisibility", t("users.ownsVisibility"))}
          <div><SubmitButton>{t("common.add")}</SubmitButton></div>
        </form>
      </Card>
      <Card>
        <ul className="divide-y divide-stone-100">
          {users.map((u) => (
            <li key={u.id} className="py-3">
              <form action={updateUser.bind(null, u.id)} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="text-sm"><p className="font-medium text-stone-900">{u.name}</p><p className="text-stone-600">{u.email}</p></div>
                <Field label={t("users.role")}>
                  <select className={inputCls} name="role" defaultValue={u.role}>
                    {s.roleEnum.enumValues.map((r) => <option key={r} value={r}>{t(`role.${r}` as Key)}</option>)}
                  </select>
                </Field>
                <div className="space-y-1">
                  {check("active", t("users.active"), u.active)}
                  {check("ownsAdoptions", t("users.ownsAdoptions"), u.ownsAdoptions)}
                  {check("ownsVisibility", t("users.ownsVisibility"), u.ownsVisibility)}
                </div>
                <Field label={t("users.resetPassword")}><input className={inputCls} type="password" name="password" minLength={12} autoComplete="new-password" /></Field>
                <div><button className={btnGhost}>{t("common.save")}</button></div>
              </form>
              {u.id !== me.id && (
                <form action={deleteUser.bind(null, u.id)} className="mt-2 flex items-center gap-2">
                  <ConfirmDelete label={t("users.delete")} confirmLabel={t("common.sure")} />
                  <span className="text-xs text-stone-500">{t("users.deleteHelp")}</span>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
