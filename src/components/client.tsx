"use client";
import { Check, ChevronDown, LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { fold } from "@/lib/text";

const primary =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60 cursor-pointer";

/** A form's main button. It shows progress, and can't be pressed twice while saving. */
export function SubmitButton({ children, className = primary }: { children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending}>
      {pending && <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/** Small one-tap action inside a form, such as marking a reminder done. */
export function DoneButton({ label, ariaLabel }: { label: string; ariaLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      aria-label={ariaLabel}
      className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 hover:bg-brand-100 disabled:opacity-60"
    >
      {pending ? <LoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Check aria-hidden className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

/** Deleting takes two taps: the first one arms the button for a few seconds. */
export function ConfirmDelete({ label, confirmLabel }: { label: string; confirmLabel: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  // The two buttons have different keys so React swaps the element. Reusing one element would turn the
  // tapped button into a submit button before the browser finished the tap, submitting on the first tap.
  if (armed) {
    return <button key="confirm" className="min-h-8 cursor-pointer rounded-lg bg-red-700 px-2.5 py-1 text-xs font-semibold text-white">{confirmLabel}</button>;
  }
  return (
    <button key="arm" type="button" onClick={(e) => { e.preventDefault(); setArmed(true); }} aria-label={label} title={label} className="inline-flex min-h-8 cursor-pointer items-center rounded-lg px-2 py-1 text-stone-400 hover:bg-red-50 hover:text-red-700">
      <Trash2 aria-hidden className="h-4 w-4" />
    </button>
  );
}

export function Toast({ kind, message, closeLabel, children }: { kind: "ok" | "error"; message: string; closeLabel: string; children?: ReactNode }) {
  const [open, setOpen] = useState(true);
  const hasAction = Boolean(children);
  useEffect(() => {
    const url = new URL(window.location.href);
    ["saved", "error", "done"].forEach((p) => url.searchParams.delete(p));
    window.history.replaceState(window.history.state, "", url);
    if (kind === "error") return;
    const id = setTimeout(() => setOpen(false), hasAction ? 9000 : 3500);
    return () => clearTimeout(id);
  }, [kind, hasAction]);
  if (!open) return null;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`toast-in fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg md:bottom-6 ${kind === "error" ? "bg-red-800 text-white" : "bg-stone-900 text-white"}`}
    >
      <span className="flex-1">{message}</span>
      {children}
      <button type="button" onClick={() => setOpen(false)} aria-label={closeLabel} className="cursor-pointer opacity-70 hover:opacity-100"><X aria-hidden className="h-4 w-4" /></button>
    </div>
  );
}

/** Opens its content in a dialog, which appears as a bottom sheet on phones. */
export function ModalButton({ label, title, closeLabel, className, icon, iconOnly, children }: {
  label: string; title: string; closeLabel: string; className: string; icon?: ReactNode;
  /** Shows only the icon; the label is still read out and shown on hover. */
  iconOnly?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={className} title={iconOnly ? label : undefined} aria-label={iconOnly ? label : undefined} onClick={() => ref.current?.showModal()}>{icon}{!iconOnly && label}</button>
      <dialog
        ref={ref}
        // Browser validation stops submit from firing, so an invalid form stays open.
        onSubmit={() => setTimeout(() => ref.current?.close(), 0)}
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        className="mx-auto mb-0 mt-auto max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-0 sm:my-auto sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-100 bg-white px-5 py-3.5">
          <h2 className="text-base font-semibold text-stone-900">{title}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label={closeLabel} className="cursor-pointer rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"><X aria-hidden className="h-5 w-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </dialog>
    </>
  );
}

export type Option = { id: string; name: string };

/** A searchable replacement for a very long select. Submits the chosen id under `name`. */
export function Combobox({ name, options, placeholder, emptyLabel, inputClass, ariaLabel }: { name: string; options: Option[]; placeholder: string; emptyLabel: string; inputClass: string; ariaLabel?: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = useMemo(() => {
    const q = fold(query);
    return (q ? options.filter((o) => fold(o.name).includes(q)) : options).slice(0, 40);
  }, [options, query]);
  const choose = (o: Option) => { setSelected(o.id); setQuery(o.name); setOpen(false); };
  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected} />
      <input
        role="combobox" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel} autoComplete="off"
        className={`${inputClass} pr-9`} value={query} placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQuery(e.target.value); setSelected(""); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          if (e.key === "Enter" && open && matches[active]) { e.preventDefault(); choose(matches[active]); }
          if (e.key === "Escape" && open) { e.stopPropagation(); e.preventDefault(); setOpen(false); }
        }}
      />
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-stone-400" />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-stone-500">{emptyLabel}</li>}
          {matches.map((o, i) => (
            <li key={o.id} role="option" aria-selected={o.id === selected}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-brand-50 text-brand-900" : "text-stone-800"}`}>
              {o.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Status, plus what it needs: the shelter location for "in_shelter", the person for
 * fostering and adoption. Each extra field shows only for the statuses it belongs to.
 */
export function MoveFields({ statuses, needsPerson, initial, statusLabel, personLabel, children, select, locations = [], initialLocation, locationLabel }: {
  statuses: { value: string; label: string }[]; needsPerson: string[]; initial: string; statusLabel: string; personLabel: string; children?: ReactNode; select: string;
  locations?: Option[]; initialLocation?: string | null; locationLabel?: string;
}) {
  const [status, setStatus] = useState(initial);
  return (
    <>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-stone-700">{statusLabel}</span>
        <select className={select} name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      {status === "in_shelter" && locations.length > 0 && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">{locationLabel}</span>
          <select className={select} name="locationId" defaultValue={initialLocation ?? (locations.length === 1 ? locations[0].id : "")} required>
            <option value="" disabled>{"—"}</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      )}
      {children && needsPerson.includes(status) && (
        <div className="block text-sm">
          <span className="mb-1 block font-medium text-stone-700">{personLabel}</span>
          {children}
        </div>
      )}
    </>
  );
}

type ProductOption = { id: string; name: string; kinds: string[] };

/**
 * Type, product, clinic and test result of a medical record. The product list follows
 * the chosen type and disappears for types no product belongs to; the result shows for tests only.
 */
export function MedicalKindFields({ kinds, products, clinics, labels, select, initial }: {
  kinds: { value: string; label: string }[];
  products: ProductOption[];
  clinics: { id: string; name: string }[];
  labels: { kind: string; product: string; clinic: string; none: string; productHelp: string; result: string; negative: string; positive: string };
  select: string;
  /** The values of a record being corrected. */
  initial?: { kind: string; productId: string | null; clinicId: string | null; result: string | null };
}) {
  const [kind, setKind] = useState(initial?.kind ?? kinds[0]?.value ?? "");
  const [productId, setProductId] = useState(initial?.productId ?? "");
  const fitting = products.filter((p) => p.kinds.includes(kind));
  const field = (label: string, control: ReactNode, help?: string) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-stone-700">{label}</span>
      {control}
      {help && <span className="mt-1 block text-xs text-stone-500">{help}</span>}
    </label>
  );
  return (
    <>
      {field(labels.kind, (
        <select className={select} name="kind" value={kind} onChange={(e) => {
          setKind(e.target.value);
          // A product chosen for another type would be refused on save, so it is cleared.
          if (!products.find((p) => p.id === productId)?.kinds.includes(e.target.value)) setProductId("");
        }}>
          {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      ))}
      {fitting.length > 0 && field(labels.product, (
        <select className={select} name="productId" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">{labels.none}</option>
          {fitting.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ), labels.productHelp)}
      {clinics.length > 0 && field(labels.clinic, (
        <select className={select} name="clinicId" defaultValue={initial?.clinicId ?? ""}>
          <option value="">{labels.none}</option>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      ))}
      {kind.startsWith("test_") && field(labels.result, (
        <select className={select} name="result" defaultValue={initial?.result ?? ""}>
          <option value="">{labels.none}</option>
          <option value="negative">{labels.negative}</option>
          <option value="positive">{labels.positive}</option>
        </select>
      ))}
    </>
  );
}
