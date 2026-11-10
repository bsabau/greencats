"use client";
import { CircleAlert, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { fold } from "@/lib/text";

export type BrowserCard = {
  id: string; name: string; search: string; status: string; tab: string; group: string; statusLabel: string; tone: string;
  photoId: string | null; tint: string; meta: string; place: string | null; overdue: string | null; fiv: string | null;
};
export type Tab = { value: string; label: string; count: number };

export function AnimalBrowser({ cards, tabs, initial, placeholder, emptyLabel, resultsLabel }: { cards: BrowserCard[]; tabs: Tab[]; initial: string; placeholder: string; emptyLabel: string; resultsLabel: string }) {
  const [group, setGroup] = useState(initial);
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = fold(query);
    return cards.filter((c) => {
      const inGroup = group === "all" || (group === "care" ? c.group === "care" : group === "foster" ? c.status.startsWith("foster") : c.tab === group);
      // A search looks across every status, so a cat can't hide behind the wrong filter.
      return q ? c.search.includes(q) : inGroup;
    });
  }, [cards, group, query]);
  const choose = (value: string) => {
    setGroup(value);
    const url = new URL(window.location.href);
    url.searchParams.set("status", value);
    window.history.replaceState(window.history.state, "", url);
  };
  return (
    <>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-stone-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none" />
      </div>
      <div className={`no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0 ${query ? "opacity-40" : ""}`}>
        {tabs.map((tab) => (
          <button key={tab.value} type="button" onClick={() => choose(tab.value)} aria-pressed={group === tab.value}
            className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${group === tab.value ? "bg-brand-700 font-semibold text-white" : "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50"}`}>
            {tab.label} <span className={group === tab.value ? "text-brand-100" : "text-stone-400"}>{tab.count}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-stone-500">{resultsLabel.replace("{count}", String(visible.length))}</p>
      {visible.length === 0 ? <p className="py-10 text-center text-sm text-stone-500">{emptyLabel}</p> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((c) => (
            <li key={c.id}>
              <Link href={`/animals/${c.id}`} className="block h-full overflow-hidden rounded-2xl border border-stone-200/80 bg-white hover:border-brand-400">
                {c.photoId
                  ? <img src={`/photos/${c.photoId}`} alt={c.name} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  : <div aria-hidden className={`flex aspect-[4/3] w-full items-center justify-center ${c.tint}`}><PawMark /></div>}
                <div className="space-y-1 p-3">
                  <p className="truncate font-semibold text-stone-900">{c.name}</p>
                  {c.meta && <p className="truncate text-xs text-stone-500">{c.meta}</p>}
                  <span className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium ${c.tone}`}>{c.statusLabel}</span>
                  {c.place && <p className="truncate text-xs text-stone-600">{c.place}</p>}
                  {(c.overdue || c.fiv) && (
                    <p className="flex flex-wrap gap-x-2 text-xs font-medium text-red-700">
                      {c.overdue && <span className="inline-flex items-center gap-1"><CircleAlert aria-hidden className="h-3 w-3" />{c.overdue}</span>}
                      {c.fiv && <span>{c.fiv}</span>}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function PawMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-10 w-10 opacity-60" fill="currentColor">
      <circle cx="6" cy="10" r="2.2" /><circle cx="10" cy="6" r="2.2" /><circle cx="14" cy="6" r="2.2" /><circle cx="18" cy="10" r="2.2" />
      <path d="M12 11c-3 0-6 3.2-6 6 0 1.7 1.3 2.5 2.8 2.5 1.2 0 2-.6 3.2-.6s2 .6 3.2.6c1.5 0 2.8-.8 2.8-2.5 0-2.8-3-6-6-6z" />
    </svg>
  );
}
