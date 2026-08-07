"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { StatusBadge } from "@/components/ui/Badge";
import {
  type ApprovalTurnaroundFilters,
  type ApproverTurnaroundRow,
  downloadApprovalTurnaroundCsv,
  fetchApprovalTurnaround,
} from "@/lib/approvalTurnaround";

const BOTTLENECK_HOURS = 48;

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 24) return `${hours} ชม.`;
  return `${Math.round((hours / 24) * 10) / 10} วัน`;
}

export default function ApprovalTurnaroundPage() {
  const [rows, setRows] = useState<ApproverTurnaroundRow[]>([]);
  const [filters, setFilters] = useState<ApprovalTurnaroundFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback((f: ApprovalTurnaroundFilters) => {
    return fetchApprovalTurnaround(f)
      .then((rows) => {
        setError(null);
        setRows(rows);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh({});
  }, [refresh]);

  function updateFilter(patch: Partial<ApprovalTurnaroundFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    setLoading(true);
    refresh(next);
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await downloadApprovalTurnaroundCsv(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งออกไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell
      title="ความล่าช้าของสายอนุมัติ"
      actions={
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
        >
          {exporting ? "กำลังส่งออก..." : "⬇ Export CSV"}
        </button>
      }
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">ความล่าช้าของสายอนุมัติ</h1>
        <p className="mt-1 text-sm text-ink-3">
          เวลารอเฉลี่ย/สูงสุดของแต่ละผู้อนุมัติ (จากประวัติที่ตัดสินใจแล้ว) และจำนวนคำขอที่ค้างอยู่กับแต่ละคนตอนนี้ —
          แถวที่ไฮไลต์คือค้างนานเกิน 2 วัน
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <label htmlFor="turnaround-start-date" className="sr-only">
            วันที่เริ่มต้น
          </label>
          <input
            id="turnaround-start-date"
            name="startDate"
            type="date"
            value={filters.startDate ?? ""}
            onChange={(e) => updateFilter({ startDate: e.target.value || undefined })}
            className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm"
          />
          <label htmlFor="turnaround-end-date" className="sr-only">
            วันที่สิ้นสุด
          </label>
          <input
            id="turnaround-end-date"
            name="endDate"
            type="date"
            value={filters.endDate ?? ""}
            onChange={(e) => updateFilter({ endDate: e.target.value || undefined })}
            className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm"
          />
          <span className="ml-auto self-center text-xs text-ink-3">{rows.length} คน</span>
        </div>

        {error && <p className="mt-4 text-sm text-rejected-fg">{error}</p>}

        <div className="mt-4 overflow-x-auto rounded-lg border border-hairline bg-surface shadow-e1">
          <table className="min-w-full divide-y divide-hairline text-sm">
            <thead className="bg-surface-2">
              <tr>
                <Th>ผู้อนุมัติ</Th>
                <Th>ตัดสินใจแล้ว</Th>
                <Th>อนุมัติ</Th>
                <Th>ปฏิเสธ</Th>
                <Th>เวลารอเฉลี่ย</Th>
                <Th>เวลารอสูงสุด</Th>
                <Th>ค้างอยู่ตอนนี้</Th>
                <Th>ค้างนานสุด</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-ink-3">
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-ink-3">
                    ไม่พบข้อมูลตามเงื่อนไข
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const isBottleneck = (r.oldestPendingWaitHours ?? 0) >= BOTTLENECK_HOURS;
                return (
                  <tr key={r.approverId} className={isBottleneck ? "bg-risk-bg" : undefined}>
                    <td className="px-4 py-3 font-medium text-ink">{r.fullName}</td>
                    <td className="px-4 py-3 tabular-nums">{r.decidedCount}</td>
                    <td className="px-4 py-3 tabular-nums text-approved-fg">{r.approvedCount}</td>
                    <td className="px-4 py-3 tabular-nums text-rejected-fg">{r.rejectedCount}</td>
                    <td className="px-4 py-3 tabular-nums">{formatHours(r.avgWaitHours)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatHours(r.maxWaitHours)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.pendingCount > 0 ? (
                        <StatusBadge status="pending">{r.pendingCount} รายการ</StatusBadge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`px-4 py-3 tabular-nums ${isBottleneck ? "font-semibold text-risk-fg" : ""}`}>
                      {formatHours(r.oldestPendingWaitHours)}
                      {isBottleneck && " 🚩"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
      {children}
    </th>
  );
}
