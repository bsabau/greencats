import { SubmitButton } from "@/components/client";
import { changePassword, setLanguage } from "@/app/actions";
import { Card, Field, Flash, Page, btn, btnGhost, inputCls } from "@/components/ui";
import { getI18n } from "@/i18n";
import { requireUser } from "@/lib/auth";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireUser({ allowPasswordChange: true });
  const { t, locale } = await getI18n();
  return (
    <Page title={t("account.title")}>
      <Flash params={await searchParams} t={t} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t("account.language")}>
          <form action={setLanguage} className="flex items-end gap-2">
            <input type="hidden" name="back" value="/account" />
            <div className="flex-1">
              <Field label={t("account.language")}>
                <select className={inputCls} name="locale" defaultValue={locale}>
                  <option value="ro">Română</option><option value="en">English</option>
                </select>
              </Field>
            </div>
            <button className={btnGhost}>{t("common.save")}</button>
          </form>
        </Card>
        <Card title={t("account.change")}>
          <form action={changePassword} className="space-y-3">
            <Field label={t("account.current")}><input className={inputCls} type="password" name="current" autoComplete="current-password" required /></Field>
            <Field label={t("account.new")}><input className={inputCls} type="password" name="next" minLength={12} autoComplete="new-password" required /></Field>
            <SubmitButton>{t("account.change")}</SubmitButton>
          </form>
        </Card>
      </div>
    </Page>
  );
}
