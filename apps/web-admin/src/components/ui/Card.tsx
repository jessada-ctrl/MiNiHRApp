import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { StatusBadge, type BadgeStatus } from "./Badge";

const PADDING = { compact: "p-[18px]", default: "p-6", hero: "p-8" } as const;
const TONE_VAR = { brand: "var(--color-brand-500)", approved: "var(--color-approved)", risk: "var(--color-risk)" } as const;

/**
 * Card (C2) — depth comes from 3 things stacked, not one heavy shadow: surface
 * lighter than the page background + hairline border + e2 elevation.
 */
export function Card({
  children,
  className = "",
  padding = "default",
  hoverable = false,
  elevated = false,
}: {
  children: ReactNode;
  className?: string;
  padding?: keyof typeof PADDING;
  hoverable?: boolean;
  elevated?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-hairline bg-surface shadow-e1 transition-[box-shadow,transform,border-color] duration-150 ${PADDING[padding]} ${
        elevated ? "shadow-e2" : ""
      } ${hoverable ? "cursor-pointer hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-e3" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

function Sparkline({ points, tone = "approved" }: { points: number[]; tone?: "approved" | "risk" | "brand" }) {
  const w = 88;
  const h = 28;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = w / (points.length - 1 || 1);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${i * step},${h - ((p - min) / range) * h}`).join(" ");
  const stroke = tone === "risk" ? "var(--color-rejected)" : tone === "brand" ? "var(--color-brand-500)" : "var(--color-approved)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="shrink-0" aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Metric card — always 4 parts: label, number (tabular-nums, 32/800), a delta
 * or a progress indicator, and a sparkline/bar. Never leave a number floating alone.
 */
export function MetricCard({
  label,
  value,
  icon: Icon,
  delta,
  trend,
  progress,
  caption,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  delta?: { direction: "up" | "down"; label: string; positive?: boolean };
  trend?: number[];
  progress?: number;
  caption?: string;
  tone?: "brand" | "approved" | "risk";
}) {
  const overLimit = tone === "risk" && (progress ?? 0) >= 100;
  return (
    <Card padding="default" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {Icon && (
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            style={{ background: `color-mix(in srgb, ${TONE_VAR[tone]} 14%, transparent)`, color: TONE_VAR[tone] }}
          >
            <Icon size={16} />
          </span>
        )}
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">{label}</span>
      </div>

      <div className="num text-[32px] font-extrabold leading-[1.15] tracking-tight text-ink">{value}</div>

      {delta && (
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold ${
              delta.positive === false ? "text-rejected-fg" : "text-approved-fg"
            }`}
          >
            {delta.direction === "up" ? "▲" : "▼"} {delta.label}
          </span>
          {trend && <Sparkline points={trend} tone={delta.positive === false ? "risk" : "approved"} />}
        </div>
      )}

      {progress !== undefined && (
        <div className="flex flex-col gap-1.5">
          <div className={`h-2 w-full overflow-hidden rounded-full ${overLimit ? "bg-risk-bg" : "bg-quiet-bg"}`}>
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${overLimit ? "bg-risk" : "bg-brand-500"}`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          {caption && (
            <span className={`text-xs ${overLimit ? "font-semibold text-risk-fg" : "text-ink-3"}`}>{caption}</span>
          )}
        </div>
      )}
    </Card>
  );
}

/** Person summary row — avatar (navy + initials) + name/meta + status badge. */
export function PersonRow({
  name,
  meta,
  status,
  statusLabel,
}: {
  name: string;
  meta: string;
  status: BadgeStatus;
  statusLabel: ReactNode;
}) {
  const initial = name.trim().slice(0, 1) || "?";
  return (
    <Card padding="compact" className="flex items-center gap-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white"
        aria-hidden="true"
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{name}</p>
        <p className="truncate text-xs text-ink-3">{meta}</p>
      </div>
      <StatusBadge status={status}>{statusLabel}</StatusBadge>
    </Card>
  );
}
