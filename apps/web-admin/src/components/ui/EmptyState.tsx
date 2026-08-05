import type { LucideIcon } from "lucide-react";

/**
 * Empty state template — fixed 4-part structure: tinted icon chip, bold
 * headline stating the real status, a one-sentence next step, one ghost
 * button. Deliberately no illustrations — keeps the dashboard reading as a
 * serious product rather than a toy.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-hairline-strong bg-bg-elev px-6 py-12 text-center">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600"
        style={{ animation: "lalaPop .42s cubic-bezier(.34,1.32,.64,1) both" }}
      >
        <Icon size={22} />
      </span>
      <p className="text-sm font-bold text-ink">{title}</p>
      <p className="max-w-xs text-xs text-ink-2">{hint}</p>
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="mt-1 rounded-full border border-hairline-strong px-4 py-1.5 text-xs font-semibold text-brand-600 transition-colors hover:bg-brand-50"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
