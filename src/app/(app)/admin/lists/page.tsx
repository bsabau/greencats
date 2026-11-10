import { asc, count, sql } from "drizzle-orm";
import { mergeClinic, mergeProduct, saveClinic, saveProduct } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Field, Flash, Page, btn, btnGhost, inputCls } from "@/components/ui";
import { db, schema as s } from "@/db";
import { getI18n, type Key, type T } from "@/i18n";
import { requirePermission } from "@/lib/auth";
import { unlinkedFilter } from "@/lib/catalog";
import { PRODUCT_KINDS } from "@/lib/medical-schedule";
import { normalizeTerm } from "@/lib/product-match";

type Product = typeof s.products.$inferSelect;
type Clinic = typeof s.clinics.$inferSelect;

function ProductForm({ t, product, aliases, action }: { t: T; product?: Product; aliases?: string[]; action: (fd: FormData) => Promise<void> }) {
  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field label={t("common.name")}><input className={inputCls} name="name" defaultValue={product?.name ?? ""} required maxLength={80} /></Field>
      <Field label={t("lists.interval")} help={t("lists.intervalHelp")}>
        <input className={inputCls} type="number" name="intervalDays" min={1} max={730} defaultValue={product?.intervalDays ?? ""} />
      </Field>
      <fieldset className="text-sm sm:col-span-2">
        <legend className="mb-1 font-medium text-stone-700">{t("lists.kinds")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {PRODUCT_KINDS.map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-stone-700">
              <input type="checkbox" name="kinds" value={k} defaultChecked={product?.kinds.includes(k)} />{t(`kind.${k}` as Key)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <Field label={t("lists.aliases")} help={t("lists.aliasesHelp")}>
          <input className={inputCls} name="aliases" defaultValue={aliases?.join(", ") ?? ""} />
        </Field>
      </div>
      {product && <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" name="active" defaultChecked={product.active} />{t("lists.active")}</label>}
      <div className="sm:col-span-2"><SubmitButton>{t("common.save")}</SubmitButton></div>
    </form>
  );
}

function ClinicForm({ t, clinic, aliases, action }: { t: T; clinic?: Clinic; aliases?: string[]; action: (fd: FormData) => Promise<void> }) {
  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
      <Field label={t("common.name")}><input className={inputCls} name="name" defaultValue={clinic?.name ?? ""} required maxLength={80} /></Field>
      <Field label={t("lists.aliases")} help={t("lists.aliasesHelp")}><input className={inputCls} name="aliases" defaultValue={aliases?.join(", ") ?? ""} /></Field>
      {clinic && <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" name="active" defaultChecked={clinic.active} />{t("lists.active")}</label>}
      <div className="sm:col-span-2"><SubmitButton>{t("common.save")}</SubmitButton></div>
    </form>
  );
}

function MergeForm({ t, action, others, help }: { t: T; action: (fd: FormData) => Promise<void>; others: { id: string; name: string }[]; help: string }) {
  if (others.length === 0) return null;
  return (
    <form action={action} className="mt-4 border-t border-stone-100 pt-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Field label={t("lists.merge")}>
            <select className={inputCls} name="targetId" required defaultValue="">
              <option value="" disabled>{t("common.none")}</option>
              {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
        </div>
        <button className={btnGhost}>{t("lists.mergeButton")}</button>
      </div>
      <p className="mt-1 text-xs text-stone-500">{help}</p>
    </form>
  );
}

export default async function ListsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requirePermission("lists:manage");
  const { t } = await getI18n();
  const [products, clinics, productAliases, clinicAliases, productUse, clinicUse, [{ unlinked }]] = await Promise.all([
    db.select().from(s.products).orderBy(asc(s.products.name)),
    db.select().from(s.clinics).orderBy(asc(s.clinics.name)),
    db.select().from(s.productAliases),
    db.select().from(s.clinicAliases),
    db.select({ id: s.medicalRecords.productId, n: count() }).from(s.medicalRecords).where(sql`${s.medicalRecords.productId} is not null`).groupBy(s.medicalRecords.productId),
    db.select({ id: s.medicalRecords.clinicId, n: count() }).from(s.medicalRecords).where(sql`${s.medicalRecords.clinicId} is not null`).groupBy(s.medicalRecords.clinicId),
    db.select({ unlinked: count() }).from(s.medicalRecords).where(unlinkedFilter),
  ]);
  const used = new Map([...productUse, ...clinicUse].map((u) => [u.id, u.n]));
  const usedLabel = (id: string) => {
    const n = used.get(id) ?? 0;
    return n === 1 ? t("lists.usedOne") : t("lists.used", { n });
  };
  // The name itself is always recognised, so only the other spellings are shown.
  const othersOf = (rows: { alias: string; id: string }[], id: string, name: string) =>
    rows.filter((a) => a.id === id && a.alias !== normalizeTerm(name)).map((a) => a.alias).sort();
  const pAliases = productAliases.map((a) => ({ alias: a.alias, id: a.productId }));
  const cAliases = clinicAliases.map((a) => ({ alias: a.alias, id: a.clinicId }));

  // Grouped by the types a product covers, in a fixed order, so a list of forty stays easy to scan.
  const groupKey = (p: Product) => PRODUCT_KINDS.filter((k) => p.kinds.includes(k)).join("+");
  const groups = new Map<string, Product[]>();
  for (const p of [...products].sort((a, b) => groupKey(a).localeCompare(groupKey(b)) || a.name.localeCompare(b.name))) {
    groups.set(groupKey(p), [...(groups.get(groupKey(p)) ?? []), p]);
  }
  const order = (key: string) => PRODUCT_KINDS.findIndex((k) => key.startsWith(k)) * 10 + key.split("+").length;

  return (
    <Page title={t("lists.title")}>
      <Flash params={await searchParams} t={t} />
      <p className="text-sm text-stone-600">{t("lists.intro")}</p>
      {unlinked > 0 && <p className="text-sm text-stone-600">{t("lists.unlinked", { n: unlinked })}</p>}

      <Card title={`${t("lists.products")} (${products.length})`}>
        <details>
          <summary className={`${btn} list-none`}>{t("lists.newProduct")}</summary>
          <ProductForm t={t} action={saveProduct.bind(null, null)} />
        </details>
        <div className="mt-4 space-y-5">
          {[...groups.entries()].sort(([a], [b]) => order(a) - order(b)).map(([key, items]) => (
            <section key={key}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{key.split("+").map((k) => t(`kind.${k}` as Key)).join(" + ")}</h3>
              <ul className="mt-1 divide-y divide-stone-100">
                {items.map((p) => {
                  const aliases = othersOf(pAliases, p.id, p.name);
                  return (
                    <li key={p.id} className="py-2.5 text-sm">
                      <details>
                        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium text-stone-900">{p.name}</span>
                          {!p.active && <Badge>{t("lists.inactive")}</Badge>}
                          <span className="text-xs text-stone-500">
                            {[p.intervalDays ? t("lists.intervalShort", { n: p.intervalDays }) : t("lists.generalRule"), usedLabel(p.id)].join(" · ")}
                          </span>
                          {aliases.length > 0 && <span className="w-full truncate text-xs text-stone-400">{aliases.join(", ")}</span>}
                        </summary>
                        <ProductForm t={t} product={p} aliases={aliases} action={saveProduct.bind(null, p.id)} />
                        <MergeForm t={t} action={mergeProduct.bind(null, p.id)} others={products.filter((o) => o.id !== p.id)} help={t("lists.mergeHelp")} />
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </Card>

      <Card title={`${t("lists.clinics")} (${clinics.length})`}>
        <details>
          <summary className={`${btn} list-none`}>{t("lists.newClinic")}</summary>
          <ClinicForm t={t} action={saveClinic.bind(null, null)} />
        </details>
        <ul className="mt-4 divide-y divide-stone-100">
          {clinics.map((c) => {
            const aliases = othersOf(cAliases, c.id, c.name);
            return (
              <li key={c.id} className="py-2.5 text-sm">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-stone-900">{c.name}</span>
                    {!c.active && <Badge>{t("lists.inactive")}</Badge>}
                    <span className="text-xs text-stone-500">{usedLabel(c.id)}</span>
                    {aliases.length > 0 && <span className="w-full truncate text-xs text-stone-400">{aliases.join(", ")}</span>}
                  </summary>
                  <ClinicForm t={t} clinic={c} aliases={aliases} action={saveClinic.bind(null, c.id)} />
                  <MergeForm t={t} action={mergeClinic.bind(null, c.id)} others={clinics.filter((o) => o.id !== c.id)} help={t("lists.mergeClinicHelp")} />
                </details>
              </li>
            );
          })}
        </ul>
      </Card>
    </Page>
  );
}
