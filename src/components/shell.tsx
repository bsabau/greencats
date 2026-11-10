"use client";
import {
  CalendarDays, ChartColumn, ClipboardCheck, Ellipsis, HeartHandshake, History, House, LogOut, Megaphone,
  PawPrint, Search, Settings, ShieldCheck, Tags, UserCog, Users, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

const ICONS = {
  home: House, animals: PawPrint, people: Users, calendar: CalendarDays, adoptions: HeartHandshake, visibility: Megaphone,
  reports: ChartColumn, review: ClipboardCheck, lists: Tags, users: UserCog, audit: History, privacy: ShieldCheck, account: Settings,
};
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };
type Hit = { href: string; title: string; subtitle: string };

const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path.startsWith(href));

function SearchBox({ placeholder, emptyLabel, onDone, autoFocus }: { placeholder: string; emptyLabel: string; onDone?: () => void; autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (autoFocus) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autoFocus]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits(null); return; }
    const controller = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: Hit[]) => { setHits(rows); setActive(0); })
        .catch(() => {});
    }, 140);
    return () => { clearTimeout(id); controller.abort(); };
  }, [q]);

  const go = (h: Hit) => { setQ(""); setHits(null); input.current?.blur(); onDone?.(); router.push(h.href); };
  return (
    <div className="relative">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
      <input
        ref={input} autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        onBlur={() => setTimeout(() => setHits(null), 150)}
        onKeyDown={(e) => {
          if (!hits?.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          if (e.key === "Enter") { e.preventDefault(); go(hits[active]); }
        }}
        className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none"
      />
      {hits && (
        <ul className="absolute left-0 z-40 mt-1 max-h-80 w-full min-w-64 overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-xl">
          {hits.length === 0 && <li className="px-3 py-2 text-sm text-stone-500">{emptyLabel}</li>}
          {hits.map((h, i) => (
            <li key={h.href}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); go(h); }} className={`block w-full cursor-pointer px-3 py-2 text-left ${i === active ? "bg-brand-50" : ""}`}>
                <span className="block truncate text-sm font-medium text-stone-900">{h.title}</span>
                <span className="block truncate text-xs text-stone-500">{h.subtitle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Shell({ items, userName, appName, logout, labels, children }: {
  items: NavItem[]; userName: string; appName: string; logout: () => Promise<void>;
  labels: { search: string; noResults: string; more: string; logout: string; close: string };
  children: ReactNode;
}) {
  const path = usePathname();
  const [sheet, setSheet] = useState<"more" | "search" | null>(null);
  useEffect(() => setSheet(null), [path]);
  const primary = items.filter((i) => ["/", "/animals", "/calendar", "/people"].includes(i.href));
  const rest = items.filter((i) => !primary.includes(i));
  const moreActive = rest.some((i) => isActive(i.href, path));
  const Brand = (
    <span className="flex items-center gap-2 font-semibold text-brand-800">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-700 text-white"><PawPrint aria-hidden className="h-4.5 w-4.5" /></span>
      {appName}
    </span>
  );

  return (
    <div className="md:flex">
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:gap-4 md:border-r md:border-stone-200/70 md:px-3 md:py-5">
        <div className="px-2">{Brand}</div>
        <SearchBox placeholder={labels.search} emptyLabel={labels.noResults} />
        <nav className="flex-1 space-y-0.5 overflow-y-auto">
          {items.map((n) => {
            const Icon = ICONS[n.icon];
            const on = isActive(n.href, path);
            return (
              <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${on ? "bg-brand-700 font-semibold text-white" : "text-stone-700 hover:bg-stone-200/60"}`}>
                <Icon aria-hidden className="h-4.5 w-4.5" />{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center justify-between border-t border-stone-200/70 px-2 pt-3">
          <span className="truncate text-sm text-stone-600">{userName}</span>
          <form action={logout}><button aria-label={labels.logout} title={labels.logout} className="cursor-pointer rounded-lg p-1.5 text-stone-500 hover:bg-stone-200/60"><LogOut aria-hidden className="h-4 w-4" /></button></form>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200/70 bg-[#faf7f2]/95 px-4 py-2.5 backdrop-blur md:hidden">
        {Brand}
        <button type="button" aria-label={labels.search} onClick={() => setSheet("search")} className="cursor-pointer rounded-lg p-2 text-stone-700"><Search aria-hidden className="h-5 w-5" /></button>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-4 sm:px-6 md:pb-10 md:pt-7">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((n) => {
          const Icon = ICONS[n.icon];
          const on = isActive(n.href, path);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${on ? "font-semibold text-brand-700" : "text-stone-500"}`}>
              <Icon aria-hidden className="h-5 w-5" />{n.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setSheet("more")} className={`flex cursor-pointer flex-col items-center gap-0.5 py-2 text-[11px] ${moreActive ? "font-semibold text-brand-700" : "text-stone-500"}`}>
          <Ellipsis aria-hidden className="h-5 w-5" />{labels.more}
        </button>
      </nav>

      {sheet && (
        <div className="fixed inset-0 z-40 bg-stone-900/40 md:hidden" onClick={() => setSheet(null)}>
          <div className={`absolute inset-x-0 bg-[#faf7f2] p-4 ${sheet === "search" ? "top-0 rounded-b-2xl" : "bottom-0 rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"}`} onClick={(e) => e.stopPropagation()}>
            {sheet === "search" ? (
              <div className="flex items-start gap-2">
                <div className="flex-1"><SearchBox autoFocus placeholder={labels.search} emptyLabel={labels.noResults} onDone={() => setSheet(null)} /></div>
                <button type="button" aria-label={labels.close} onClick={() => setSheet(null)} className="cursor-pointer p-2 text-stone-600"><X aria-hidden className="h-5 w-5" /></button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {rest.map((n) => {
                    const Icon = ICONS[n.icon];
                    return (
                      <Link key={n.href} href={n.href} className={`flex flex-col items-center gap-1 rounded-xl bg-white p-3 text-center text-xs ${isActive(n.href, path) ? "font-semibold text-brand-700" : "text-stone-700"}`}>
                        <Icon aria-hidden className="h-5 w-5" />{n.label}
                      </Link>
                    );
                  })}
                </div>
                <form action={logout} className="mt-3 flex items-center justify-between px-1">
                  <span className="text-sm text-stone-600">{userName}</span>
                  <button className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-stone-700"><LogOut aria-hidden className="h-4 w-4" />{labels.logout}</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
