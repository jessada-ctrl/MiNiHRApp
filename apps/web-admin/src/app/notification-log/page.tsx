"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  type NotificationLogFilters,
  type NotificationLogRow,
  downloadNotificationLogCsv,
  fetchNotificationLog,
} from "@/lib/notificationLog";

const MESSAGE_TYPE_LABEL: Record<string, string> = {
  chatbot_reply: "ตอบแชทบอท",
  leave_request_pending: "แจ้งคำขอลารออนุมัติ",
  leave_request_reminder: "เตือนคำขอลาค้างอนุมัติ",
  leave_request_decision: "แจ้งผลอนุมัติ/ปฏิเสธ",
  hr_over_quota_alert: "แจ้ง HR: เกินโควตา",
  hr_weekly_digest: "สรุปรายสัปดาห์ (HR)",
  holiday_reminder: "แจ้งเตือนวันหยุด",
};

const STATUS_LABEL: Record<string, string> = { sent: "ส่งสำเร็จ", failed: "ส่งไม่สำเร็จ" };
const STATUS_CLASS: Record<string, string> = { sent: "bg-green-100 text-green-800", failed: "bg-red-100 text-red-800" };

export default function NotificationLogPage() {
  const [rows, setRows] = useState<NotificationLogRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [filters, setFilters] = useState<NotificationLogFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(async (f: NotificationLogFilters) => {
    setError(null);
    try {
      const report = await fetchNotificationLog(f);
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

  function updateFilter(patch: Partial<NotificationLogFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    setLoading(true);
    refresh(next);
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await downloadNotificationLogCsv(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งออกไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell
      title="บันทึกการแจ้งเตือน LINE"
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
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">บันทึกการแจ้งเตือน LINE</h1>
        <p className="mt-1 text-sm text-neutral-500">
          ประวัติการส่งข้อความ LINE ทั้งหมด (แชทบอท, แจ้งเตือนอนุมัติ, วันหยุด ฯลฯ) ใช้ตรวจสอบว่าทำไมพนักงานไม่ได้รับแจ้งเตือน
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={filters.messageType ?? ""}
            onChange={(e) => updateFilter({ messageType: e.target.value || undefined })}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          >
            <option value="">ทุกประเภทข้อความ</option>
            {Object.entries(MESSAGE_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
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
                <Th>เวลาส่ง</Th>
                <Th>ผู้รับ</Th>
                <Th>ประเภทข้อความ</Th>
                <Th>สถานะ</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                    กำลังโหลด...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                    ไม่พบรายการตามเงื่อนไข
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className={r.status === "failed" ? "bg-red-50" : undefined}>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                    {new Date(r.sentAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-3">{r.recipientFullName ?? <span className="text-xs text-neutral-400">{r.recipientLineUserId}</span>}</td>
                  <td className="px-4 py-3 text-neutral-600">{MESSAGE_TYPE_LABEL[r.messageType] ?? r.messageType}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status] ?? ""}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
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
