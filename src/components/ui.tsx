import { PawPrint } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Toast } from "@/components/client";
import type { Key, T } from "@/i18n";

export const inputCls =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";
export const btn =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 cursor-pointer";
export const btnGhost =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 cursor-pointer";
export const btnDanger =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 cursor-pointer";
export const linkCls = "text-brand-700 underline-offset-2 hover:underline";

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-stone-900">{title}</h1>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, actions, children, id }: { title?: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-2xl border border-stone-200/80 bg-white p-4 sm:p-5">
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-stone-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-stone-700">{label}</span>
      {children}
      {help && <span className="mt-1 block text-xs text-stone-500">{help}</span>}
    </label>
  );
}

const TONES = {
  green: "bg-brand-100 text-brand-900",
  blue: "bg-sky-100 text-sky-900",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-900",
  purple: "bg-violet-100 text-violet-900",
  gray: "bg-stone-200 text-stone-800",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  casuta: "green", ana_adi: "green", clinic: "red", foster: "blue", foster_adoption: "blue",
  adoption_incomplete: "amber", adopted: "purple", deceased: "gray", external: "gray", unknown: "amber",
};
export const StatusBadge = ({ status, t }: { status: string; t: T }) => (
  <Badge tone={STATUS_TONE[status] ?? "gray"}>{t(`status.${status}` as Key)}</Badge>
);

export function Stat({ label, value, href, tone }: { label: string; value: number | string; href?: string; tone?: "alert" }) {
  const body = (
    <>
      <div className={`text-3xl font-semibold tabular-nums ${tone === "alert" ? "text-red-800" : "text-stone-900"}`}>{value}</div>
      <div className="mt-1 text-sm text-stone-600">{label}</div>
    </>
  );
  const cls = "block rounded-2xl border border-stone-200/80 bg-white p-4";
  return href ? <Link href={href} className={`${cls} hover:border-brand-400`}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function Flash({ params, t, undo }: { params: { error?: string; saved?: string; done?: string }; t: T; undo?: ReactNode }) {
  const closeLabel = t("common.close");
  // A fresh key per response brings the toast back when the same page saves twice in a row.
  if (params.error) return <Toast key={Date.now()} kind="error" closeLabel={closeLabel} message={t(`err.${params.error}` as Key) ?? t("err.invalid")} />;
  if (params.done) return <Toast key={Date.now()} kind="ok" closeLabel={closeLabel} message={t("home.doneToast")}>{undo}</Toast>;
  if (params.saved) return <Toast key={Date.now()} kind="ok" closeLabel={closeLabel} message={t("common.saved")} />;
  return null;
}

/** A cat's photo, or a quiet placeholder that leaves the attention on real photos. */
export function AnimalPhoto({ photoId, name, className }: { photoId: string | null; name: string; className: string }) {
  if (photoId) return <img src={`/photos/${photoId}`} alt={name} loading="lazy" className={`${className} object-cover`} />;
  return <div aria-hidden className={`${className} flex items-center justify-center bg-stone-100 text-stone-400`}><PawPrint className="h-1/3 w-1/3" /></div>;
}

export function Empty({ t }: { t: T }) {
  return <p className="py-4 text-sm text-stone-500">{t("common.empty")}</p>;
}

export function Definition({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-stone-900">{children}</dd>
    </div>
  );
}

export const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>
);
export const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <th className={`border-b border-stone-200 px-2 py-2 text-xs font-semibold text-stone-500 ${right ? "text-right" : ""}`}>{children}</th>
);
export const Td = ({ children, right }: { children?: ReactNode; right?: boolean }) => (
  <td className={`border-b border-stone-100 px-2 py-2 align-top text-stone-800 ${right ? "text-right tabular-nums" : ""}`}>{children}</td>
);
