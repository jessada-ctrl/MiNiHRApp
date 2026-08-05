"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { StatusBadge } from "@/components/ui/Badge";
import { ResponsiveTable, type TableColumn } from "@/components/ui/Table";
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
const STATUS_BADGE: Record<string, "approved" | "rejected"> = { sent: "approved", failed: "rejected" };

const COLUMNS: TableColumn<NotificationLogRow>[] = [
  {
    key: "sentAt",
    header: "เวลาส่ง",
    render: (r) => new Date(r.sentAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }),
  },
  {
    key: "recipient",
    header: "ผู้รับ",
    render: (r) => r.recipientFullName ?? <span className="text-xs text-ink-3">{r.recipientLineUserId}</span>,
  },
  {
    key: "messageType",
    header: "ประเภทข้อความ",
    render: (r) => MESSAGE_TYPE_LABEL[r.messageType] ?? r.messageType,
  },
  {
    key: "status",
    header: "สถานะ",
    render: (r) => (
      <StatusBadge status={STATUS_BADGE[r.status] ?? "quiet"}>{STATUS_LABEL[r.status] ?? r.status}</StatusBadge>
    ),
  },
];

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
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
        >
          {exporting ? "กำลังส่งออก..." : "⬇ Export CSV"}
        </button>
      }
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">บันทึกการแจ้งเตือน LINE</h1>
        <p className="mt-1 text-sm text-ink-3">
          ประวัติการส่งข้อความ LINE ทั้งหมด (แชทบอท, แจ้งเตือนอนุมัติ, วันหยุด ฯลฯ) ใช้ตรวจสอบว่าทำไมพนักงานไม่ได้รับแจ้งเตือน
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={filters.messageType ?? ""}
            onChange={(e) => updateFilter({ messageType: e.target.value || undefined })}
            className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm"
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
            className="rounded-md border border-hairline-strong px-3 py-1.5 text-sm"
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
        {truncated && (
          <p className="mt-4 text-sm text-amber-700">
            แสดงเฉพาะ {rows.length} รายการล่าสุดที่ตรงเงื่อนไข — ยังมีรายการเก่ากว่านี้อีก ลองแคบช่วงวันที่เพื่อดูให้ครบ
          </p>
        )}

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
              rowTone={(r) => (r.status === "failed" ? "risk" : undefined)}
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
