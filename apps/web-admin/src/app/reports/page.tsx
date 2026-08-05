"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { StatusBadge, type BadgeStatus } from "@/components/ui/Badge";
import { ResponsiveTable, type TableColumn } from "@/components/ui/Table";
import { type LeaveType, listLeaveTypes } from "@/lib/leaveTypes";
import { type ReportFilters, type ReportRow, downloadLeaveReportCsv, fetchLeaveReport } from "@/lib/reports";

const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
  cancelled: "ยกเลิกแล้ว",
};
const STATUS_BADGE: Record<string, BadgeStatus> = {
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  cancelled: "quiet",
};

const COLUMNS: TableColumn<ReportRow>[] = [
  { key: "employee", header: "พนักงาน", render: (r) => r.employee.fullName },
  { key: "leaveType", header: "ประเภท", render: (r) => r.leaveType.name },
  {
    key: "period",
    header: "ช่วงเวลา",
    render: (r) => (
      <span className="text-ink-2">
        {new Date(r.startDatetime).toLocaleDateString("th-TH")} – {new Date(r.endDatetime).toLocaleDateString("th-TH")}
      </span>
    ),
  },
  { key: "totalDays", header: "วัน", render: (r) => r.totalDays },
  {
    key: "status",
    header: "สถานะ",
    render: (r) => <StatusBadge status={STATUS_BADGE[r.status] ?? "quiet"}>{STATUS_LABEL[r.status] ?? r.status}</StatusBadge>,
  },
  {
    key: "remark",
    header: "หมายเหตุ",
    render: (r) => <span className="text-xs text-red-600">{r.isOverQuota ? "🚩 เกินโควตา (LWOP)" : ""}</span>,
  },
];

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
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
        >
          {exporting ? "กำลังส่งออก..." : "⬇ Export CSV"}
        </button>
      }
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">รายงานคำขอลา</h1>
        <p className="mt-1 text-sm text-ink-3">การ Export แต่ละครั้งจะถูกบันทึกลง Audit Log</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={filters.status ?? ""}
            onChange={(e) => updateFilter({ status: e.target.value || undefined })}
            className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm"
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
            className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm"
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
            className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm"
          />
          <input
            type="date"
            value={filters.endDate ?? ""}
            onChange={(e) => updateFilter({ endDate: e.target.value || undefined })}
            className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm"
          />
          <span className="ml-auto self-center text-xs text-ink-3">{rows.length} รายการ</span>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-4">
          {loading ? (
            <div className="rounded-lg border border-hairline bg-surface p-6 text-center text-sm text-ink-3 shadow-e1">
              กำลังโหลด...
            </div>
          ) : (
            <ResponsiveTable
              columns={COLUMNS}
              rows={rows}
              rowKey={(r) => r.id}
              rowTone={(r) => (r.isOverQuota ? "risk" : undefined)}
              emptyState={
                <div className="rounded-lg border border-hairline bg-surface p-6 text-center text-sm text-ink-3 shadow-e1">
                  ไม่พบรายการตามเงื่อนไข
                </div>
              }
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
