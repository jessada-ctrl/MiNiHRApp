import type { ReactNode } from "react";

/**
 * Bottom sticky action bar (C6) — surface background + border-top + an
 * upward-cast shadow so it reads as its own docked layer rather than a
 * floating button. Respects the safe-area inset on notched devices.
 */
export function BottomActionBar({
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  secondaryLabel,
  onSecondary,
}: {
  primaryLabel: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div
      className="sticky bottom-0 z-40 border-t border-hairline bg-surface px-4 pt-3"
      style={{ boxShadow: "0 -8px 24px -8px rgb(34 30 26 / .12)", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
    >
      <div className="flex gap-2.5">
        {secondaryLabel && (
          <button
            type="button"
            onClick={onSecondary}
            className="h-12 flex-[2] rounded-full border border-hairline-strong text-sm font-semibold text-ink transition-transform duration-150 active:scale-[.975]"
          >
            {secondaryLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled}
          className="h-12 flex-[3] rounded-full text-sm font-bold text-white shadow-e2 transition-[transform,box-shadow,opacity] duration-150 active:scale-[.975] active:shadow-e1 disabled:opacity-45"
          style={{ background: "var(--color-brand-500)" }}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
