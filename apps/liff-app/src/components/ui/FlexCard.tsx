import type { ReactNode } from "react";
import { StatusBadge, type BadgeStatus } from "./Badge";

const STRIPE_VAR: Record<BadgeStatus, string> = {
  pending: "var(--color-pending)",
  approved: "var(--color-approved)",
  rejected: "var(--color-rejected)",
  risk: "var(--color-risk)",
  info: "var(--color-info)",
  quiet: "var(--color-quiet)",
};

/**
 * LIFF Flex-style card (C6) — deliberately mirrors LINE's own Flex Message
 * visual language: a colored status stripe along the top, hero title, right-
 * aligned label/value meta rows, closed out with a step-progress bar.
 */
export function FlexCard({
  status,
  badgeLabel,
  title,
  meta,
  currentStep,
  totalSteps,
  faded = false,
  children,
}: {
  status: BadgeStatus;
  badgeLabel: ReactNode;
  title: string;
  meta: { label: string; value: ReactNode }[];
  currentStep?: number;
  totalSteps?: number;
  faded?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-hairline bg-surface shadow-e2 ${faded ? "opacity-[.92]" : ""}`}
    >
      <div className="h-[5px] w-full" style={{ background: STRIPE_VAR[status] }} aria-hidden="true" />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold leading-snug text-ink">{title}</h3>
          <StatusBadge status={status} className="shrink-0">
            {badgeLabel}
          </StatusBadge>
        </div>

        <dl className="flex flex-col gap-1">
          {meta.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
              <dt className="text-ink-3">{row.label}</dt>
              <dd className="num font-medium text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>

        {children}

        {totalSteps && (
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-full"
                style={{ background: i < (currentStep ?? 0) ? "var(--color-approved)" : "var(--color-quiet-bg)" }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
