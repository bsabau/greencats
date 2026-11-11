import { Table, Td, Th } from "@/components/ui";

const HEIGHT = 180;

export type Series = { key: string; label: string; color: string };
export type BarGroup = { key: string; label: string; short: string; values: Record<string, number> };

const Swatch = ({ color }: { color: string }) => <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />;

/**
 * Grouped bars, one group per month, drawn with plain elements so there is no chart library
 * to load. Hover or focus shows the numbers. The same figures are in a table under the chart.
 */
export function BarChart({ series, groups, tableLabel, groupHeader }: { series: Series[]; groups: BarGroup[]; tableLabel: string; groupHeader: string }) {
  const max = Math.max(1, ...groups.flatMap((g) => series.map((s) => g.values[s.key] ?? 0)));
  const scale = (n: number) => (n === 0 ? 0 : Math.max(3, (n / max) * HEIGHT));
  // Long ranges get thin bars and fewer month labels so the chart still fits a phone.
  const labelEvery = Math.ceil(groups.length / 12);
  const barWidth = series.length > 2 ? "w-1/5" : "w-1/4";
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-700">
        {series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><Swatch color={s.color} />{s.label}</span>)}
      </div>
      <div className="relative border-b border-stone-300" style={{ height: HEIGHT }}>
        <span className="absolute left-0 top-0 text-[11px] tabular-nums text-stone-500">{max}</span>
        <div aria-hidden className="absolute inset-x-0 top-0 border-t border-dashed border-stone-200" />
        <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-stone-200" />
        <div className="absolute inset-0 flex items-end pl-6">
          {groups.map((g) => (
            <div key={g.key} className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-px hover:bg-stone-100" tabIndex={0}>
              {series.map((s) => <div key={s.key} className={`${barWidth} max-w-3.5 rounded-t`} style={{ height: scale(g.values[s.key] ?? 0), background: s.color }} />)}
              <div role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs text-white group-hover:block group-focus:block">
                <div className="font-medium capitalize">{g.label}</div>
                {series.map((s) => <div key={s.key}>{s.label}: {g.values[s.key] ?? 0}</div>)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex pl-6 pt-1">
        {groups.map((g, i) => <span key={g.key} className="min-w-0 flex-1 text-center text-[11px] capitalize text-stone-500">{i % labelEvery === 0 ? g.short : ""}</span>)}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-stone-700">{tableLabel}</summary>
        <Table>
          <thead><tr><Th>{groupHeader}</Th>{series.map((s) => <Th key={s.key} right>{s.label}</Th>)}</tr></thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key}><Td><span className="capitalize">{g.label}</span></Td>{series.map((s) => <Td key={s.key} right>{g.values[s.key] ?? 0}</Td>)}</tr>
            ))}
          </tbody>
        </Table>
      </details>
    </div>
  );
}
