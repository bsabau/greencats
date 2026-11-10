import { SubmitButton } from "@/components/client";
import { createPerson } from "@/app/actions";
import { Card, Flash, Page, btn } from "@/components/ui";
import { getI18n } from "@/i18n";
import { requirePermission } from "@/lib/auth";
import { PersonFields } from "../fields";

export default async function NewPerson({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePermission("contacts:edit");
  const { t } = await getI18n();
  return (
    <Page title={t("people.new")}>
      <Flash params={await searchParams} t={t} />
      <Card>
        <form action={createPerson} className="space-y-4">
          <PersonFields t={t} />
          <SubmitButton>{t("common.save")}</SubmitButton>
        </form>
      </Card>
    </Page>
  );
}
