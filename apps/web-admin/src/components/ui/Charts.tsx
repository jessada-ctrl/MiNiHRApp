/**
 * Chart / Progress widgets (C5) — plain CSS + inline SVG, no charting library.
 * Series colors are fixed and bound to leave-type categories so every screen
 * reads the same colors; semantic status colors (pending/approved/rejected)
 * are reserved for status donuts and never reused as series colors.
 */
export const SERIES_COLORS = [
  "var(--color-brand-500)",
  "var(--color-gold-500)",
  "var(--color-clay-500)",
  "var(--color-sage-500)",
] as const;

export function MiniBarChart({
  data,
  seriesLabels,
  height = 96,
}: {
  data: { label: string; values: number[] }[];
  seriesLabels?: string[];
  height?: number;
}) {
  const maxTotal = Math.max(...data.map((d) => d.values.reduce((a, b) => a + b, 0)), 1);

  return (
    <div>
      <div className="flex items-end gap-3" style={{ height }}>
        {data.map((bar, i) => {
          const total = bar.values.reduce((a, b) => a + b, 0);
          const barHeightPct = (total / maxTotal) * 100;
          return (
            <div key={bar.label} className="flex flex-1 flex-col items-center justify-end gap-1.5" style={{ height: "100%" }}>
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm"
                style={{
                  height: `${barHeightPct}%`,
                  animation: `lalaGrow .42s cubic-bezier(.34,1.32,.64,1) both`,
                  animationDelay: `${i * 50}ms`,
                }}
              >
                {bar.values.map((v, si) => (
                  <div
                    key={si}
                    style={{ height: total ? `${(v / total) * 100}%` : 0, background: SERIES_COLORS[si % SERIES_COLORS.length] }}
                  />
                ))}
              </div>
              <span className="text-[11px] text-ink-3">{bar.label}</span>
            </div>
          );
        })}
      </div>
      {seriesLabels && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {seriesLabels.map((label, i) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-xs text-ink-2">
              <span className="h-2 w-2 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusDonut({
  segments,
  centerLabel,
}: {
  segments: { label: string; value: number; colorVar: string }[];
  centerLabel: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  // Each stop's start angle is the sum of everything before it. Recomputing
  // that prefix sum per segment keeps the map pure — a `let acc` carried across
  // iterations is a reassignment during render, which breaks under the React
  // compiler's memoization. A donut has a handful of segments, so O(n²) is free.
  const stops = segments
    .map((s, i) => {
      const from = segments.slice(0, i).reduce((a, x) => a + x.value, 0);
      const to = from + s.value;
      return `${s.colorVar} ${(from / total) * 360}deg ${(to / total) * 360}deg`;
    })
    .join(", ");

  return (
    <div className="flex items-center gap-5">
      <div
        className="relative h-28 w-28 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
        role="img"
        aria-label={`${centerLabel}: ${total}`}
      >
        <div className="absolute inset-[10px] flex flex-col items-center justify-center rounded-full bg-surface">
          <span className="num text-xl font-extrabold text-ink">{total}</span>
          <span className="text-[10px] text-ink-3">{centerLabel}</span>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs text-ink-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.colorVar }} />
            {s.label}
            <span className="num font-semibold text-ink">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LinearProgress({
  value,
  max,
  label,
  warnAt = 1,
  riskAt = 1,
}: {
  value: number;
  max: number;
  label?: string;
  /** Fraction of max (0-1) at which the bar switches to the "pending" warning tone. Defaults to 1 (no warning tier). */
  warnAt?: number;
  /** Fraction of max (0-1) at which the bar switches to the "risk" tone. Defaults to 1, i.e. only once value reaches/exceeds max. */
  riskAt?: number;
}) {
  const rawPct = max > 0 ? (value / max) * 100 : 0;
  const pct = Math.min(rawPct, 100);
  const risk = rawPct >= riskAt * 100;
  const warn = !risk && rawPct >= warnAt * 100;
  const trackClass = risk ? "bg-risk-bg" : warn ? "bg-pending-bg" : "bg-quiet-bg";
  const fillClass = risk ? "bg-risk" : warn ? "bg-pending" : "bg-brand-500";
  const labelClass = risk ? "font-semibold text-risk-fg" : warn ? "font-semibold text-pending-fg" : "text-ink-3";

  return (
    <div className="flex flex-col gap-1">
      <div className={`h-2 w-full overflow-hidden rounded-full ${trackClass}`}>
        <div className={`h-full rounded-full transition-[width] duration-300 ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
      {label && <span className={`num text-xs ${labelClass}`}>{label}</span>}
    </div>
  );
}
