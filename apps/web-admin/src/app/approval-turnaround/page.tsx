"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
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

  const refresh = useCallback(async (f: ApprovalTurnaroundFilters) => {
    setError(null);
    try {
      setRows(await fetchApprovalTurnaround(f));
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
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
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-800 disabled:opacity-60"
        >
          {exporting ? "กำลังส่งออก..." : "⬇ Export CSV"}
        </button>
      }
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">ความล่าช้าของสายอนุมัติ</h1>
        <p className="mt-1 text-sm text-neutral-500">
          เวลารอเฉลี่ย/สูงสุดของแต่ละผู้อนุมัติ (จากประวัติที่ตัดสินใจแล้ว) และจำนวนคำขอที่ค้างอยู่กับแต่ละคนตอนนี้ —
          แถวที่ไฮไลต์คือค้างนานเกิน 2 วัน
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="date"
            value={filters.startDate ?? ""}
            onChange={(e) => updateFilter({ startDate: e.target.value || undefined })}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <input
            type="date"
            value={filters.endDate ?? ""}
            onChange={(e) => updateFilter({ endDate: e.target.value || undefined })}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <span className="ml-auto self-center text-xs text-neutral-400">{rows.length} คน</span>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50">
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
            <tbody className="divide-y divide-neutral-100">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-neutral-400">
                    ไม่พบข้อมูลตามเงื่อนไข
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const isBottleneck = (r.oldestPendingWaitHours ?? 0) >= BOTTLENECK_HOURS;
                return (
                  <tr key={r.approverId} className={isBottleneck ? "bg-red-50" : undefined}>
                    <td className="px-4 py-3 font-medium text-neutral-800">{r.fullName}</td>
                    <td className="px-4 py-3 tabular-nums">{r.decidedCount}</td>
                    <td className="px-4 py-3 tabular-nums text-green-700">{r.approvedCount}</td>
                    <td className="px-4 py-3 tabular-nums text-red-700">{r.rejectedCount}</td>
                    <td className="px-4 py-3 tabular-nums">{formatHours(r.avgWaitHours)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatHours(r.maxWaitHours)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.pendingCount > 0 ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{r.pendingCount} รายการ</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`px-4 py-3 tabular-nums ${isBottleneck ? "font-semibold text-red-700" : ""}`}>
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
    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
      {children}
    </th>
  );
}
