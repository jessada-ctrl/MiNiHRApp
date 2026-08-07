"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { type AuditLogFilters, type AuditLogRow, downloadAuditLogCsv, fetchAuditLog } from "@/lib/auditLog";

const TARGET_TABLE_LABEL: Record<string, string> = {
  employees: "พนักงาน",
  leave_quotas: "โควตาการลา",
  leave_requests: "คำขอลา",
  branches: "สาขา",
  departments: "แผนก",
  tenants: "ข้อมูลบริษัท (LINE OA ฯลฯ)",
  audit_logs: "บันทึกการตรวจสอบ",
};

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback((f: AuditLogFilters) => {
    return fetchAuditLog(f)
      .then((report) => {
        setError(null);
        setRows(report.rows);
        setTruncated(report.truncated);
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

  function updateFilter(patch: Partial<AuditLogFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    setLoading(true);
    refresh(next);
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await downloadAuditLogCsv(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งออกไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell
      title="บันทึกการตรวจสอบ"
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
        <h1 className="text-2xl font-semibold tracking-tight text-ink">บันทึกการตรวจสอบ</h1>
        <p className="mt-1 text-sm text-ink-3">
          ประวัติการเปลี่ยนแปลงข้อมูลสำคัญทั้งหมดในระบบ (ใคร ทำอะไร เมื่อไหร่) — การ Export แต่ละครั้งจะถูกบันทึกไว้ด้วย
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <label htmlFor="audit-target-table" className="sr-only">
            ประเภทข้อมูล
          </label>
          <select
            id="audit-target-table"
            name="targetTable"
            value={filters.targetTable ?? ""}
            onChange={(e) => updateFilter({ targetTable: e.target.value || undefined })}
            className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm"
          >
            <option value="">ทุกประเภทข้อมูล</option>
            {Object.entries(TARGET_TABLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label htmlFor="audit-action-search" className="sr-only">
            ค้นหาการกระทำ
          </label>
          <input
            id="audit-action-search"
            name="action"
            type="text"
            placeholder="ค้นหาการกระทำ เช่น employee.update"
            value={filters.action ?? ""}
            onChange={(e) => updateFilter({ action: e.target.value || undefined })}
            className="w-56 rounded-md border border-hairline-strong px-3 py-1.5 text-sm"
          />
          <label htmlFor="audit-start-date" className="sr-only">
            วันที่เริ่มต้น
          </label>
          <input
            id="audit-start-date"
            name="startDate"
            type="date"
            value={filters.startDate ?? ""}
            onChange={(e) => updateFilter({ startDate: e.target.value || undefined })}
            className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm"
          />
          <label htmlFor="audit-end-date" className="sr-only">
            วันที่สิ้นสุด
          </label>
          <input
            id="audit-end-date"
            name="endDate"
            type="date"
            value={filters.endDate ?? ""}
            onChange={(e) => updateFilter({ endDate: e.target.value || undefined })}
            className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm"
          />
          <span className="ml-auto self-center text-xs text-ink-3">{rows.length} รายการ</span>
        </div>

        {error && <p className="mt-4 text-sm text-rejected-fg">{error}</p>}
        {truncated && (
          <p className="mt-4 text-sm text-pending-fg">
            แสดงเฉพาะ {rows.length} รายการล่าสุดที่ตรงเงื่อนไข — ยังมีรายการเก่ากว่านี้อีก ลองแคบช่วงวันที่เพื่อดูให้ครบ
          </p>
        )}

        <div className="mt-4 overflow-x-auto rounded-lg border border-hairline bg-surface shadow-e1">
          <table className="min-w-full divide-y divide-hairline text-sm">
            <thead className="bg-surface-2">
              <tr>
                <Th>เวลา</Th>
                <Th>ผู้กระทำ</Th>
                <Th>การกระทำ</Th>
                <Th>ประเภทข้อมูล</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                    ไม่พบรายการตามเงื่อนไข
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-2">
                    {new Date(r.timestamp).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">{r.actorFullName ?? r.userId}</span>
                    {r.actorEmail && <span className="block text-xs text-ink-3">{r.actorEmail}</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-2">{r.action}</td>
                  <td className="px-4 py-3 text-ink-2">{TARGET_TABLE_LABEL[r.targetTable] ?? r.targetTable}</td>
                  <td className="px-4 py-3 text-xs text-ink-3">{r.ipAddress}</td>
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
    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
      {children}
    </th>
  );
}
