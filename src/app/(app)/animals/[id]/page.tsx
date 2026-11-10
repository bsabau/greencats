import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { HeartPulse, Pencil, Repeat2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addMedicalRecord, completeDue, deleteAnimal, deleteMedicalRecord, moveAnimal, undoComplete, updateAnimal, uploadPhoto } from "@/app/actions";
import { Combobox, ConfirmDelete, DoneButton, MedicalKindFields, ModalButton, MoveFields, SubmitButton } from "@/components/client";
import { AnimalPhoto, Badge, Card, Definition, Empty, Field, Flash, StatusBadge, btn, btnGhost, inputCls, linkCls, type Tone } from "@/components/ui";
import { db, schema as s } from "@/db";
import { getI18n, type Key } from "@/i18n";
import { requireUser } from "@/lib/auth";
import { ageInMonths, addDays, todayIso } from "@/lib/dates";
import { can, redactFields, redactPhones } from "@/lib/permissions";
import { AnimalFields } from "../fields";

const TABS = ["overview", "medical", "placements", "photos"] as const;
type TabName = (typeof TABS)[number];
const TAB_LABEL: Record<TabName, Key> = { overview: "animals.tabOverview", medical: "animals.tabMedical", placements: "animals.tabPlacements", photos: "animals.tabPhotos" };
const CORE_KINDS = ["vaccine_polyvalent", "vaccine_rabies", "deworm_external", "deworm_internal"] as const;
const SOON_DAYS = 14;
const NEEDS_PERSON = ["foster", "foster_adoption", "adoption_incomplete", "adopted"];

export default async function AnimalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string; done?: string; tab?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { t, fmtDate, fmtAge } = await getI18n();
  const sp = await searchParams;
  const tab: TabName = TABS.includes(sp.tab as TabName) ? (sp.tab as TabName) : "overview";
  const [stored] = await db.select().from(s.animals).where(eq(s.animals.id, id));
  if (!stored) notFound();
  // Every text field a person can type into, so a number written in an unexpected box stays hidden too.
  const animal = redactFields(user, stored, [
    "locationNote", "currentTreatment", "intakeHistory", "medicalSummary", "otherInfo", "refillNotes", "deathNote",
    "contractText", "birthText", "intakeText", "sterilizedText", "color", "healthBookNo", "passport",
  ]);

  const [medical, placements, photos, issues, people, products, clinics, locations] = await Promise.all([
    db.select().from(s.medicalRecords).where(eq(s.medicalRecords.animalId, id)).orderBy(sql`${s.medicalRecords.date} desc nulls last`),
    db.select({ p: s.placements, personName: s.people.name }).from(s.placements).innerJoin(s.people, eq(s.people.id, s.placements.personId)).where(eq(s.placements.animalId, id)).orderBy(desc(s.placements.open), sql`${s.placements.startDate} desc nulls last`),
    db.select().from(s.photos).where(eq(s.photos.animalId, id)),
    can(user, "review:manage") ? db.select().from(s.importIssues).where(and(eq(s.importIssues.animalId, id), eq(s.importIssues.resolved, false))) : Promise.resolve([]),
    db.select({ id: s.people.id, name: s.people.name }).from(s.people).where(isNull(s.people.erasedAt)).orderBy(asc(s.people.name)),
    db.select({ id: s.products.id, name: s.products.name, kinds: s.products.kinds, active: s.products.active }).from(s.products).orderBy(asc(s.products.name)),
    db.select({ id: s.clinics.id, name: s.clinics.name, active: s.clinics.active }).from(s.clinics).orderBy(asc(s.clinics.name)),
    db.select({ id: s.locations.id, name: s.locations.name, active: s.locations.active }).from(s.locations).orderBy(asc(s.locations.name)),
  ]);
  const locationName = locations.find((l) => l.id === animal.locationId)?.name ?? null;
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const clinicName = new Map(clinics.map((c) => [c.id, c.name]));

  const none = t("common.none");
  const closeLabel = t("common.close");
  const today = todayIso();
  const soon = addDays(today, SOON_DAYS);
  const profile = Object.entries(animal.profile ?? {});
  const age = fmtAge(animal.birthPrecision ? ageInMonths(animal.birthDate, today) : null, animal.birthPrecision);
  const current = placements.find(({ p }) => p.open);
  const fiv = medical.find((m) => m.kind === "test_fiv_felv" && m.result);
  const latestOf = (kind: string) => medical.find((m) => m.kind === kind);
  const backToMedical = `/animals/${id}?tab=medical`;
  const undo = sp.done ? (
    <form action={undoComplete.bind(null, sp.done, backToMedical)}><button className="cursor-pointer whitespace-nowrap font-semibold underline">{t("common.undo")}</button></form>
  ) : undefined;
  const byYear = new Map<string, typeof medical>();
  for (const m of medical) {
    const year = m.date?.slice(0, 4) ?? none;
    byYear.set(year, [...(byYear.get(year) ?? []), m]);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Flash params={sp} t={t} undo={undo} />

      <section className="flex flex-col gap-4 rounded-2xl border border-stone-200/80 bg-white p-4 sm:flex-row sm:p-5">
        <AnimalPhoto photoId={photos[0]?.id ?? null} name={animal.name} className={`shrink-0 rounded-xl sm:aspect-square sm:h-36 sm:w-36 ${photos[0] ? "aspect-[4/3] w-full" : "h-20 w-20"}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-stone-900">{animal.name}</h1>
            <StatusBadge status={animal.status} location={locationName} t={t} />
          </div>
          <p className="mt-0.5 text-sm text-stone-600">
            {[age, animal.sex === "f" ? t("animals.female") : animal.sex === "m" ? t("animals.male") : null, animal.color].filter(Boolean).join(" · ") || none}
          </p>
          {current && (
            <p className="mt-1 text-sm text-stone-700">
              <Link className={linkCls} href={`/people/${current.p.personId}`}>{t("animals.fostered", { name: current.personName })}</Link>
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {animal.sterilized === "yes" && <Badge tone="green">{t("animals.sterilized")}</Badge>}
            {animal.sterilized === "no" && <Badge tone="amber">{t("rep.notSterilized")}</Badge>}
            {fiv && <Badge tone={fiv.result === "positive" ? "red" : "green"}>FIV/FeLV: {t(`result.${fiv.result!}` as Key)}</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ModalButton label={t("animals.addMedical")} title={t("animals.addMedical")} closeLabel={closeLabel} className={btn} icon={<HeartPulse aria-hidden className="h-4 w-4" />}>
              <form action={addMedicalRecord.bind(null, id)} className="grid gap-3 sm:grid-cols-2">
                <MedicalKindFields
                  kinds={s.medicalKindEnum.enumValues.map((k) => ({ value: k, label: t(`kind.${k}` as Key) }))}
                  products={products.filter((p) => p.active)}
                  clinics={clinics.filter((c) => c.active)}
                  labels={{ kind: t("animals.type"), product: t("animals.product"), clinic: t("animals.clinic"), none: none, productHelp: t("animals.productHelp"), result: t("animals.result"), negative: t("result.negative"), positive: t("result.positive") }}
                  select={inputCls}
                />
                <Field label={t("common.date")}><input className={inputCls} type="date" name="date" defaultValue={today} required /></Field>
                <Field label={t("animals.description")}><input className={inputCls} name="description" placeholder={t("animals.descriptionHint")} /></Field>
                <Field label={t("animals.nextDue")} help={t("animals.nextDueHelp")}><input className={inputCls} type="date" name="nextDueOn" /></Field>
                <div className="flex items-end sm:col-span-2"><SubmitButton>{t("common.save")}</SubmitButton></div>
              </form>
            </ModalButton>
            <ModalButton label={t("animals.move")} title={t("animals.move")} closeLabel={closeLabel} className={btnGhost} icon={<Repeat2 aria-hidden className="h-4 w-4" />}>
              <form action={moveAnimal.bind(null, id)} className="space-y-3">
                <MoveFields
                  statuses={s.animalStatusEnum.enumValues.map((v) => ({ value: v, label: t(`status.${v}` as Key) }))}
                  needsPerson={NEEDS_PERSON} initial={animal.status} statusLabel={t("common.status")} personLabel={t("animals.person")} select={inputCls}
                  locations={locations.filter((l) => l.active || l.id === animal.locationId)} initialLocation={animal.locationId} locationLabel={t("animals.shelterLocation")}
                >
                  <Combobox name="personId" options={people} placeholder={t("common.search")} emptyLabel={t("search.none")} inputClass={inputCls} />
                </MoveFields>
                <Field label={t("animals.moveDate")}><input className={inputCls} type="date" name="date" defaultValue={today} /></Field>
                <SubmitButton>{t("common.save")}</SubmitButton>
              </form>
            </ModalButton>
            <ModalButton label={t("animals.editDetails")} title={t("animals.editDetails")} closeLabel={closeLabel} className={btnGhost} icon={<Pencil aria-hidden className="h-4 w-4" />}>
              <form action={updateAnimal.bind(null, id)} className="space-y-4">
                <AnimalFields t={t} values={animal} />
                <SubmitButton>{t("common.save")}</SubmitButton>
              </form>
              {can(user, "animals:delete") && (
                <form action={deleteAnimal.bind(null, id)} className="mt-6 flex items-center gap-2 border-t border-stone-100 pt-4">
                  <ConfirmDelete label={t("animals.delete")} confirmLabel={t("common.sure")} />
                  <span className="text-xs text-stone-500">{t("animals.deleteHelp")}</span>
                </form>
              )}
            </ModalButton>
          </div>
        </div>
      </section>

      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-stone-200" aria-label={animal.name}>
        {TABS.map((name) => {
          const count = name === "medical" ? medical.length : name === "placements" ? placements.length : name === "photos" ? photos.length : 0;
          return (
            <Link key={name} href={`/animals/${id}?tab=${name}`} scroll={false} aria-current={tab === name ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === name ? "border-brand-700 font-semibold text-brand-800" : "border-transparent text-stone-600 hover:text-stone-900"}`}>
              {t(TAB_LABEL[name])}{count > 0 && <span className="ml-1 text-stone-400">{count}</span>}
            </Link>
          );
        })}
      </nav>

      {tab === "overview" && (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {issues.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <h2 className="text-sm font-semibold text-amber-900">{t("animals.issues")}</h2>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900">
                  {issues.map((i) => <li key={i.id}>{i.message}</li>)}
                </ul>
              </div>
            )}
            {animal.currentTreatment && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <h2 className="text-sm font-semibold text-red-900">{t("animals.treatment")}</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-red-950">{animal.currentTreatment}</p>
              </div>
            )}
            <Card title={t("animals.details")}>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Definition label={t("animals.birth")}>{fmtDate(animal.birthDate, animal.birthPrecision)}{animal.birthText && animal.birthPrecision !== "day" ? ` (${animal.birthText})` : ""}</Definition>
                <Definition label={t("animals.intake")}>{fmtDate(animal.intakeDate, animal.intakePrecision)}{animal.intakeText && animal.intakePrecision !== "day" ? ` (${animal.intakeText})` : ""}</Definition>
                <Definition label={t("animals.sterilized")}>{animal.sterilizedText ?? (animal.sterilized === "yes" ? t("common.yes") : animal.sterilized === "no" ? t("common.no") : none)}</Definition>
                <Definition label={t("animals.book")}>{animal.healthBookNo ?? none}</Definition>
                <Definition label={t("animals.chip")}>{animal.microchip ?? none}</Definition>
                <Definition label={t("animals.passport")}>{animal.passport ?? none}</Definition>
                {animal.contractText && <Definition label={t("animals.contract")}>{animal.contractText}</Definition>}
                {animal.deathDate && <Definition label={t("animals.death")}>{fmtDate(animal.deathDate)}{animal.deathNote ? `\n${animal.deathNote}` : ""}</Definition>}
              </dl>
            </Card>
            {([["animals.summary", animal.medicalSummary], ["animals.history", animal.intakeHistory], ["animals.location", animal.locationNote], ["animals.other", animal.otherInfo], ["animals.refill", animal.refillNotes]] as [Key, string | null][])
              .filter(([, v]) => v)
              .map(([k, v]) => <Card key={k} title={t(k)}><p className="whitespace-pre-wrap break-words text-sm text-stone-800">{v}</p></Card>)}
          </div>
          {profile.length > 0 && (
            <Card title={t("animals.profile")}>
              <dl className="space-y-2.5">{profile.map(([k, v]) => <Definition key={k} label={k}>{redactPhones(user, v)}</Definition>)}</dl>
            </Card>
          )}
        </div>
      )}

      {tab === "medical" && (
        <div id="medical" className="space-y-4">
          <Card title={t("animals.statusNow")}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {CORE_KINDS.map((kind) => {
                const last = latestOf(kind);
                const due = last?.nextDueOn ?? null;
                const state: [Key, Tone] | null = !due ? null : due < today ? ["animals.dueState.overdue", "red"] : due <= soon ? ["animals.dueState.soon", "amber"] : ["animals.dueState.ok", "green"];
                return (
                  <li key={kind} className="flex items-start justify-between gap-2 rounded-xl bg-stone-50 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900">{t(`kind.${kind}` as Key)}</p>
                      <p className="text-xs text-stone-600">{last ? [t("animals.lastOn", { date: fmtDate(last.date, last.precision) }), last.productId ? productName.get(last.productId) : null].filter(Boolean).join(" · ") : t("animals.never")}</p>
                      {due && <p className="text-xs text-stone-600">{t("animals.nextDue")}: {fmtDate(due)}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {state && <Badge tone={state[1]}>{t(state[0])}</Badge>}
                      <form action={completeDue.bind(null, id, kind, backToMedical)}><DoneButton label={t("home.done")} ariaLabel={t("home.doneAria", { kind: t(`kind.${kind}` as Key), name: animal.name })} /></form>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title={t("animals.history2")}>
            {medical.length === 0 ? <Empty t={t} /> : (
              <div className="space-y-4">
                {[...byYear.entries()].map(([year, records]) => (
                  <div key={year}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{year}</h3>
                    <ul className="mt-1 divide-y divide-stone-100">
                      {records.map((m) => {
                        const detail = redactPhones(user, m.description ?? (m.date ? null : m.rawText));
                        return (
                          <li key={m.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                            <div className="min-w-0">
                              <p className="text-stone-900">
                                <span className="font-medium">{t(`kind.${m.kind}` as Key)}</span>
                                {m.result && <> <Badge tone={m.result === "positive" ? "red" : "green"}>{t(`result.${m.result}` as Key)}</Badge></>}
                              </p>
                              <p className="text-xs text-stone-600">
                                {[fmtDate(m.date, m.precision), m.productId ? productName.get(m.productId) : null, m.clinicId ? clinicName.get(m.clinicId) : null, detail, m.nextDueOn ? `${t("animals.nextDue")}: ${fmtDate(m.nextDueOn)}` : null].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            {(m.createdBy === user.id || can(user, "medical:delete_any")) && (
                              <form action={deleteMedicalRecord.bind(null, id, m.id)}><ConfirmDelete label={t("common.delete")} confirmLabel={t("common.sure")} /></form>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "placements" && (
        <Card>
          {placements.length === 0 ? <Empty t={t} /> : (
            <ul className="divide-y divide-stone-100">
              {placements.map(({ p, personName }) => (
                <li key={p.id} className="py-2.5 text-sm">
                  <Link className={`${linkCls} font-medium`} href={`/people/${p.personId}`}>{personName}</Link>
                  {p.open && <> <Badge tone="green">{t("animals.current")}</Badge></>}
                  <div className="text-stone-600">{t(`placement.${p.kind}` as Key)} · {p.startDate ? fmtDate(p.startDate) : (redactPhones(user, p.startText) ?? none)}{p.endDate ? ` – ${fmtDate(p.endDate)}` : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "photos" && (
        <Card>
          {photos.length === 0 && <p className="pb-3 text-sm text-stone-500">{t("animals.noPhotos")}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {photos.map((p) => <a key={p.id} href={`/photos/${p.id}`}><img src={`/photos/${p.id}`} alt={animal.name} className="aspect-square w-full rounded-xl object-cover" loading="lazy" /></a>)}
          </div>
          <form action={uploadPhoto.bind(null, id)} className="mt-3 flex flex-wrap items-center gap-2">
            <input className="min-w-0 flex-1 text-sm" type="file" name="photo" accept="image/png,image/jpeg,image/webp" required aria-label={t("animals.photos")} />
            <SubmitButton className={btnGhost}>{t("animals.upload")}</SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}
