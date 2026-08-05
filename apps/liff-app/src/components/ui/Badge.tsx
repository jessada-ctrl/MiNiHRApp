import type { ReactNode } from "react";
import { Check, X, TriangleAlert, Info } from "lucide-react";

export type BadgeStatus = "pending" | "approved" | "rejected" | "risk" | "info" | "quiet";

const STATUS_ICON: Partial<Record<BadgeStatus, typeof Check>> = {
  approved: Check,
  rejected: X,
  risk: TriangleAlert,
  info: Info,
};

const STATUS_CLASS: Record<BadgeStatus, string> = {
  pending: "bg-pending-bg text-pending-fg",
  approved: "bg-approved-bg text-approved-fg",
  rejected: "bg-rejected-bg text-rejected-fg",
  risk: "bg-risk-bg text-risk-fg",
  info: "bg-info-bg text-info-fg",
  quiet: "bg-quiet-bg text-quiet-fg",
};

function ringStyle(status: BadgeStatus): React.CSSProperties | undefined {
  if (status === "quiet") return undefined;
  return { boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--color-${status}) 30%, transparent)` };
}

/**
 * Status Badge (C1) — pill with a bg/fg/solid 3-layer rule: fill = -bg, text = -fg,
 * dot/icon = -solid. Color alone never carries the status; every badge also has
 * an icon (or dot for pending) plus full Thai text.
 */
export function StatusBadge({
  status,
  children,
  className = "",
}: {
  status: BadgeStatus;
  children: ReactNode;
  className?: string;
}) {
  const StatusIcon = STATUS_ICON[status];
  return (
    <span
      className={`inline-flex h-[26px] items-center gap-1.5 rounded-full pl-2 pr-2.5 text-[12.5px] font-semibold transition-[background-color,color] duration-150 ${STATUS_CLASS[status]} ${className}`}
      style={ringStyle(status)}
    >
      {StatusIcon ? (
        <StatusIcon size={12} strokeWidth={3} aria-hidden="true" />
      ) : status === "pending" ? (
        <span
          className="h-[7px] w-[7px] rounded-full"
          style={{
            background: "var(--color-pending)",
            boxShadow: "0 0 0 3px color-mix(in srgb, var(--color-pending) 22%, transparent)",
          }}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}
