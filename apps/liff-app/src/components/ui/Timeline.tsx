import { Check } from "lucide-react";

export interface TimelineStep {
  id: string | number;
  label: string;
  state: "done" | "approved" | "rejected" | "current" | "future";
  timestamp?: string;
  comment?: string;
  slaText?: string;
}

const NODE_TONE: Record<TimelineStep["state"], { fill: string; fg: string }> = {
  done: { fill: "var(--color-approved)", fg: "#fff" },
  approved: { fill: "var(--color-approved)", fg: "#fff" },
  rejected: { fill: "var(--color-rejected)", fg: "#fff" },
  current: { fill: "var(--color-brand-100)", fg: "var(--color-brand-700)" },
  future: { fill: "var(--color-quiet-bg)", fg: "var(--color-quiet-fg)" },
};

/** Approval Timeline (C4) — LIFF review screen variant, narrower left padding than Web Admin. */
export function ApprovalTimeline({ steps, paddingLeft = 26 }: { steps: TimelineStep[]; paddingLeft?: number }) {
  const passedCount = steps.filter((s) => s.state === "done" || s.state === "approved" || s.state === "rejected").length;
  const progressPct = steps.length > 1 ? (passedCount / (steps.length - 1)) * 100 : 0;

  return (
    <div className="relative" style={{ paddingLeft }}>
      <div className="absolute top-1 bottom-1 w-0.5 rounded-full bg-hairline" style={{ left: paddingLeft / 2 - 1 }} aria-hidden="true" />
      <div
        className="absolute top-1 w-0.5 origin-top rounded-full bg-approved transition-[height] duration-500"
        style={{ left: paddingLeft / 2 - 1, height: `calc((100% - 8px) * ${progressPct / 100})` }}
        aria-hidden="true"
      />

      <ol className="flex flex-col gap-4">
        {steps.map((step) => {
          const tone = NODE_TONE[step.state];
          const isFuture = step.state === "future";
          const isCurrent = step.state === "current";
          const isRejected = step.state === "rejected";
          return (
            <li key={step.id} className={`relative ${isFuture ? "opacity-[.58]" : ""}`}>
              <span
                className="absolute flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  left: -(paddingLeft / 2) - 10,
                  background: tone.fill,
                  color: tone.fg,
                  boxShadow: isCurrent ? "0 0 0 3px color-mix(in srgb, var(--color-brand-500) 24%, transparent)" : undefined,
                }}
              >
                {step.state === "done" || step.state === "approved" ? <Check size={11} strokeWidth={3} /> : null}
              </span>

              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{step.label}</span>
                {step.timestamp && <span className="num text-xs text-ink-3">{step.timestamp}</span>}
              </div>

              {step.slaText && (
                <span className="mt-1 inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                  {step.slaText}
                </span>
              )}

              {step.comment && (
                <p
                  className="mt-1.5 rounded-md px-3 py-2 text-xs leading-relaxed"
                  style={{
                    background: isRejected ? "var(--color-rejected-bg)" : "var(--color-approved-bg)",
                    color: isRejected ? "var(--color-rejected-fg)" : "var(--color-approved-fg)",
                  }}
                >
                  {step.comment}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
