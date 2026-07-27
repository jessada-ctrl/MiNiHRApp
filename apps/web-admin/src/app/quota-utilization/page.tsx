"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { type Branch, type Department, listBranches, listDepartments } from "@/lib/org";
import { type LeaveType, listLeaveTypes } from "@/lib/leaveTypes";
import {
  type QuotaUtilizationFilters,
  type QuotaUtilizationRow,
  downloadQuotaUtilizationCsv,
  fetchQuotaUtilization,
} from "@/lib/quotaUtilization";

const CURRENT_YEAR = new Date().getFullYear();

function utilizationBarClass(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-sky-600";
}

export default function QuotaUtilizationPage() {
  const [rows, setRows] = useState<QuotaUtilizationRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [filters, setFilters] = useState<QuotaUtilizationFilters>({ year: String(CURRENT_YEAR) });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(async (f: QuotaUtilizationFilters) => {
    setError(null);
    try {
      setRows(await fetchQuotaUtilization(f));
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    listDepartments().then(setDepartments).catch(() => {});
    listBranches().then(setBranches).catch(() => {});
    listLeaveTypes().then(setLeaveTypes).catch(() => {});
    refresh(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  function updateFilter(patch: Partial<QuotaUtilizationFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    setLoading(true);
    refresh(next);
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await downloadQuotaUtilizationCsv(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งออกไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell
      title="โควตาการลาแยกแผนก"
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
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">โควตาการลาแยกแผนก</h1>
        <p className="mt-1 text-sm text-neutral-500">
          ภาพรวมการใช้โควตาการลาของพนักงานที่ยังทำงานอยู่ แยกตามแผนกและประเภทการลา ต่อปี
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="number"
            value={filters.year ?? ""}
            onChange={(e) => updateFilter({ year: e.target.value || undefined })}
            className="w-24 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <select
            value={filters.departmentId ?? ""}
            onChange={(e) => updateFilter({ departmentId: e.target.value || undefined })}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          >
            <option value="">ทุกแผนก</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.departmentName}
              </option>
            ))}
          </select>
          <select
            value={filters.branchId ?? ""}
            onChange={(e) => updateFilter({ branchId: e.target.value || undefined })}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          >
            <option value="">ทุกสาขา</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.branchName}
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
          <span className="ml-auto self-center text-xs text-neutral-400">{rows.length} รายการ</span>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <Th>แผนก</Th>
                <Th>ประเภทการลา</Th>
                <Th>จำนวนพนักงาน</Th>
                <Th>โควตารวม</Th>
                <Th>ใช้ไปแล้ว</Th>
                <Th>รออนุมัติ</Th>
                <Th>คงเหลือ</Th>
                <Th>% ใช้ไป</Th>
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
              {rows.map((r) => (
                <tr key={`${r.departmentId ?? "none"}:${r.leaveTypeId}`}>
                  <td className="px-4 py-3 font-medium text-neutral-800">{r.departmentName}</td>
                  <td className="px-4 py-3 text-neutral-600">{r.leaveTypeName}</td>
                  <td className="px-4 py-3 tabular-nums">{r.employeeCount}</td>
                  <td className="px-4 py-3 tabular-nums">{r.totalQuota}</td>
                  <td className="px-4 py-3 tabular-nums">{r.used}</td>
                  <td className="px-4 py-3 tabular-nums text-amber-700">{r.pending}</td>
                  <td className="px-4 py-3 tabular-nums">{r.remaining}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className={`h-2 rounded-full ${utilizationBarClass(r.utilizationPct)}`}
                          style={{ width: `${Math.min(r.utilizationPct, 100)}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-xs text-neutral-600">{r.utilizationPct}%</span>
                    </div>
                  </td>
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
