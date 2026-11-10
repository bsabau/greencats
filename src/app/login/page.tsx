import { redirect } from "next/navigation";
import { login } from "@/app/actions";
import { Field, Flash, btn, inputCls } from "@/components/ui";
import { getI18n } from "@/i18n";
import { currentUser } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const { t } = await getI18n();
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={login} className="w-full max-w-sm space-y-4 rounded-xl border border-stone-200 bg-white p-6">
        <div>
          <p className="text-sm font-semibold text-brand-800">{t("app.name")}</p>
          <h1 className="text-xl font-semibold text-stone-900">{t("login.title")}</h1>
        </div>
        <Flash params={params} t={t} />
        <Field label={t("login.email")}><input className={inputCls} type="text" name="email" autoComplete="username" autoCapitalize="none" required /></Field>
        <Field label={t("login.password")}><input className={inputCls} type="password" name="password" autoComplete="current-password" required /></Field>
        <button className={`${btn} w-full`}>{t("login.submit")}</button>
      </form>
    </main>
  );
}
