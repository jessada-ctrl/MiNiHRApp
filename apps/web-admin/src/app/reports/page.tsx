"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { type LeaveType, listLeaveTypes } from "@/lib/leaveTypes";
import { type ReportFilters, type ReportRow, downloadLeaveReportCsv, fetchLeaveReport } from "@/lib/reports";

const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
  cancelled: "ยกเลิกแล้ว",
};
const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-neutral-200 text-neutral-600",
};

export default function ReportsPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [filters, setFilters] = useState<ReportFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(async (f: ReportFilters) => {
    setError(null);
    try {
      setRows(await fetchLeaveReport(f));
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    listLeaveTypes().then(setLeaveTypes).catch(() => {});
    refresh({});
  }, [refresh]);

  function updateFilter(patch: Partial<ReportFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    setLoading(true);
    refresh(next);
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await downloadLeaveReportCsv(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งออกไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell
      title="รายงาน"
      actions={
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-60"
        >
          {exporting ? "กำลังส่งออก..." : "⬇ Export CSV"}
        </button>
      }
    >
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">รายงานคำขอลา</h1>
        <p className="mt-1 text-sm text-neutral-500">การ Export แต่ละครั้งจะถูกบันทึกลง Audit Log</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={filters.status ?? ""}
            onChange={(e) => updateFilter({ status: e.target.value || undefined })}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          >
            <option value="">ทุกสถานะ</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={filters.leaveTypeId ?? ""}
            onChange={(e) => updateFilter({ leaveTypeId: e.target.value || undefined })}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          >
            <option value="">ทุกประเภทการลา</option>
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
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
          <span className="ml-auto self-center text-xs text-neutral-400">{rows.length} รายการ</span>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <Th>พนักงาน</Th>
                <Th>ประเภท</Th>
                <Th>ช่วงเวลา</Th>
                <Th>วัน</Th>
                <Th>สถานะ</Th>
                <Th>หมายเหตุ</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                    ไม่พบรายการตามเงื่อนไข
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className={r.isOverQuota ? "bg-red-50" : undefined}>
                  <td className="px-4 py-3">{r.employee.fullName}</td>
                  <td className="px-4 py-3">{r.leaveType.name}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {new Date(r.startDatetime).toLocaleDateString("th-TH")} – {new Date(r.endDatetime).toLocaleDateString("th-TH")}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.totalDays}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600">{r.isOverQuota ? "🚩 เกินโควตา (LWOP)" : ""}</td>
                </tr>
              ))}
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
