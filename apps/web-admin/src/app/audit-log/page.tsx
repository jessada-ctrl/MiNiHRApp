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

  const refresh = useCallback(async (f: AuditLogFilters) => {
    setError(null);
    try {
      const report = await fetchAuditLog(f);
      setRows(report.rows);
      setTruncated(report.truncated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
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
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-800 disabled:opacity-60"
        >
          {exporting ? "กำลังส่งออก..." : "⬇ Export CSV"}
        </button>
      }
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">บันทึกการตรวจสอบ</h1>
        <p className="mt-1 text-sm text-neutral-500">
          ประวัติการเปลี่ยนแปลงข้อมูลสำคัญทั้งหมดในระบบ (ใคร ทำอะไร เมื่อไหร่) — การ Export แต่ละครั้งจะถูกบันทึกไว้ด้วย
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={filters.targetTable ?? ""}
            onChange={(e) => updateFilter({ targetTable: e.target.value || undefined })}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          >
            <option value="">ทุกประเภทข้อมูล</option>
            {Object.entries(TARGET_TABLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="ค้นหาการกระทำ เช่น employee.update"
            value={filters.action ?? ""}
            onChange={(e) => updateFilter({ action: e.target.value || undefined })}
            className="w-56 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
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
        {truncated && (
          <p className="mt-4 text-sm text-amber-700">
            แสดงเฉพาะ {rows.length} รายการล่าสุดที่ตรงเงื่อนไข — ยังมีรายการเก่ากว่านี้อีก ลองแคบช่วงวันที่เพื่อดูให้ครบ
          </p>
        )}

        <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <Th>เวลา</Th>
                <Th>ผู้กระทำ</Th>
                <Th>การกระทำ</Th>
                <Th>ประเภทข้อมูล</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    ไม่พบรายการตามเงื่อนไข
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                    {new Date(r.timestamp).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-neutral-800">{r.actorFullName ?? r.userId}</span>
                    {r.actorEmail && <span className="block text-xs text-neutral-400">{r.actorEmail}</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-700">{r.action}</td>
                  <td className="px-4 py-3 text-neutral-600">{TARGET_TABLE_LABEL[r.targetTable] ?? r.targetTable}</td>
                  <td className="px-4 py-3 text-xs text-neutral-400">{r.ipAddress}</td>
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
