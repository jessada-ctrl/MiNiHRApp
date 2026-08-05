import type { CSSProperties, Key, ReactNode } from "react";

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Rendered in the mobile card as the title line instead of a label/value pair. Put this column first. */
  isTitle?: boolean;
  render: (row: T) => ReactNode;
}

/**
 * Responsive Table (C3) — one DOM structure, switched between a CSS-grid table
 * (md and up) and stacked cards (below md) purely via utility classes.
 * Rows needing attention get their whole background tinted, not just red text.
 * Column count is dynamic per usage, so grid-template-columns is set inline
 * (Tailwind can't statically pick up a class built from a runtime template string).
 */
export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  rowTone,
  emptyState,
}: {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => Key;
  rowTone?: (row: T) => "risk" | undefined;
  emptyState?: ReactNode;
}) {
  const gridStyle: CSSProperties = { gridTemplateColumns: `repeat(${columns.length}, 1fr)` };
  const titleCol = columns.find((c) => c.isTitle);
  const restCols = columns.filter((c) => !c.isTitle);

  if (rows.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-e1">
      <div className="sticky top-0 z-10 hidden bg-surface-2 md:grid" style={gridStyle}>
        {columns.map((col) => (
          <div
            key={col.key}
            className={`px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-3 ${
              col.align === "right" ? "text-right" : "text-left"
            }`}
          >
            {col.header}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 p-2 md:gap-0 md:p-0 md:divide-y md:divide-hairline">
        {rows.map((row) => {
          const tone = rowTone?.(row);
          return (
            <div
              key={rowKey(row)}
              className={`rounded-md border border-hairline p-3 transition-colors duration-100 md:grid md:min-h-[46px] md:items-center md:rounded-none md:border-0 md:p-0 md:hover:bg-brand-50 ${
                tone === "risk" ? "bg-risk-bg" : "bg-surface"
              }`}
              style={gridStyle}
            >
              {titleCol && (
                <div className="mb-1.5 text-sm font-semibold text-ink md:mb-0 md:px-4 md:py-2.5 md:text-inherit md:font-normal">
                  {titleCol.render(row)}
                </div>
              )}
              <div className="flex flex-col gap-1 md:hidden">
                {restCols.map((col) => (
                  <div key={col.key} className="flex items-center justify-between text-xs">
                    <span className="text-ink-3">{col.header}</span>
                    <span className="num text-ink">{col.render(row)}</span>
                  </div>
                ))}
              </div>
              {restCols.map((col) => (
                <div
                  key={col.key}
                  className={`num hidden text-sm text-ink md:block md:px-4 md:py-2.5 ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {col.render(row)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
