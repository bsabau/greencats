import { MoveFields, SubmitButton } from "@/components/client";
import { createAnimal } from "@/app/actions";
import { Card, Flash, Page, inputCls } from "@/components/ui";
import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getI18n, type Key } from "@/i18n";
import { requirePermission } from "@/lib/auth";
import { AnimalFields } from "../fields";

export default async function NewAnimal({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requirePermission("animals:edit");
  const { t } = await getI18n();
  // Statuses that need a person are set afterwards, from the animal's page.
  const initial = s.animalStatusEnum.enumValues.filter((v) => ["in_shelter", "clinic", "external", "unknown"].includes(v));
  const locations = await db.select({ id: s.locations.id, name: s.locations.name }).from(s.locations).where(eq(s.locations.active, true)).orderBy(asc(s.locations.name));
  return (
    <Page title={t("animals.new")}>
      <Flash params={await searchParams} t={t} />
      <Card>
        <form action={createAnimal} className="space-y-4">
          <MoveFields
            statuses={initial.map((v) => ({ value: v, label: t(`status.${v}` as Key) }))} needsPerson={[]} initial="in_shelter"
            statusLabel={t("common.status")} personLabel={t("animals.person")} select={inputCls}
            locations={locations} locationLabel={t("animals.shelterLocation")}
          />
          <AnimalFields t={t} />
          <SubmitButton>{t("common.save")}</SubmitButton>
        </form>
      </Card>
    </Page>
  );
}
