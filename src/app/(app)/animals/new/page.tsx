import { SubmitButton } from "@/components/client";
import { createAnimal } from "@/app/actions";
import { Card, Field, Flash, Page, btn, inputCls } from "@/components/ui";
import { schema as s } from "@/db";
import { getI18n, type Key } from "@/i18n";
import { requirePermission } from "@/lib/auth";
import { AnimalFields } from "../fields";

export default async function NewAnimal({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePermission("animals:edit");
  const { t } = await getI18n();
  // Statuses that need a person are set afterwards, from the animal's page.
  const initial = s.animalStatusEnum.enumValues.filter((v) => ["casuta", "ana_adi", "clinic", "external", "unknown"].includes(v));
  return (
    <Page title={t("animals.new")}>
      <Flash params={await searchParams} t={t} />
      <Card>
        <form action={createAnimal} className="space-y-4">
          <Field label={t("common.status")}>
            <select className={inputCls} name="status" defaultValue="casuta">
              {initial.map((v) => <option key={v} value={v}>{t(`status.${v}` as Key)}</option>)}
            </select>
          </Field>
          <AnimalFields t={t} />
          <SubmitButton>{t("common.save")}</SubmitButton>
        </form>
      </Card>
    </Page>
  );
}
