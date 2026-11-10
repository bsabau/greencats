import Link from "next/link";
import { Page, btn } from "@/components/ui";
import { getAnimalCards } from "@/domain/animals";
import { CARE_STATUSES } from "@/domain/due";
import { getI18n, type Key } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { ageInMonths, todayIso } from "@/lib/dates";
import { fold } from "@/lib/text";
import { AnimalBrowser, type BrowserCard, type Tab } from "./browser";

const TONE: Record<string, string> = {
  casuta: "bg-brand-100 text-brand-800", ana_adi: "bg-brand-100 text-brand-800", clinic: "bg-red-100 text-red-900",
  foster: "bg-sky-100 text-sky-900", foster_adoption: "bg-sky-100 text-sky-900", adoption_incomplete: "bg-amber-100 text-amber-900",
  adopted: "bg-violet-100 text-violet-900", deceased: "bg-stone-200 text-stone-800", external: "bg-stone-200 text-stone-800", unknown: "bg-amber-100 text-amber-900",
};
const TAB_ORDER = ["casuta", "ana_adi", "clinic", "adoption_incomplete", "adopted", "external", "unknown", "deceased"] as const;

export default async function AnimalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireUser();
  const { t, fmtAge } = await getI18n();
  const params = await searchParams;
  const cards = await getAnimalCards();
  const today = todayIso();
  const careSet = new Set<string>(CARE_STATUSES);

  const browserCards: BrowserCard[] = cards.map((c) => {
    const age = fmtAge(c.birthPrecision ? ageInMonths(c.birthDate, today) : null, c.birthPrecision);
    const sex = c.sex === "f" ? t("animals.female") : c.sex === "m" ? t("animals.male") : null;
    return {
      id: c.id, name: c.name, status: c.status, group: careSet.has(c.status) ? "care" : "other",
      search: fold([c.name, ...c.aliases, c.microchip ?? ""].join(" ")),
      statusLabel: t(`status.${c.status}` as Key), tone: TONE[c.status] ?? TONE.unknown, tint: "bg-stone-100 text-stone-300",
      photoId: c.photoId, meta: [age, sex, c.color].filter(Boolean).join(" · "),
      place: c.personName ? t("animals.fostered", { name: c.personName }) : null,
      overdue: c.overdue ? t("animals.overdueCount", { n: c.overdue }) : null,
      fiv: c.fivPositive ? t("animals.fivPositive") : null,
    };
  });
  const countOf = (statuses: string[]) => cards.filter((c) => statuses.includes(c.status)).length;
  const tabs: Tab[] = [
    { value: "care", label: t("animals.groupCare"), count: countOf([...CARE_STATUSES]) },
    { value: "foster", label: t("status.foster"), count: countOf(["foster", "foster_adoption"]) },
    ...TAB_ORDER.map((v) => ({ value: v as string, label: t(`status.${v}` as Key), count: countOf([v]) })).filter((tab) => tab.count > 0),
    { value: "all", label: t("common.all"), count: cards.length },
  ];
  const initial = tabs.some((tab) => tab.value === params.status) ? params.status! : "care";

  return (
    <Page title={t("animals.title")} actions={<Link className={btn} href="/animals/new">{t("animals.new")}</Link>}>
      <AnimalBrowser cards={browserCards} tabs={tabs} initial={initial} placeholder={t("animals.searchHint")} emptyLabel={t("animals.none")} resultsLabel={t("animals.results", { count: "{count}" })} />
    </Page>
  );
}
