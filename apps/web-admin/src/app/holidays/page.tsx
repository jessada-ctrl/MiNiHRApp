"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getCurrentUser } from "@/lib/auth";
import { type Holiday, createHoliday, deleteHoliday, listHolidays } from "@/lib/holidays";

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Holiday | null>(null);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    getCurrentUser().then((u) => setCanManage(u?.role === "tenant_admin"));
  }, []);

  const refresh = useCallback(() => {
    return listHolidays()
      .then((rows) => {
        setError(null);
        setHolidays(rows);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteHoliday(id);
      setConfirmTarget(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell
      title="ปฏิทินวันหยุด"
      actions={
        canManage && (
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600"
          >
            + เพิ่มวันหยุด
          </button>
        )
      }
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">ปฏิทินวันหยุดประจำปี</h1>
        <p className="mt-1 text-sm text-ink-3">
          ระบบจะแจ้งเตือนพนักงานผ่าน LINE ล่วงหน้าตามจำนวนวันที่กำหนด — ส่วนการส่งแจ้งเตือนอัตโนมัติจริงยังไม่เปิดใช้งาน (รอเชื่อมต่อ LINE)
        </p>

        {error && <p className="mt-4 text-sm text-rejected-fg">{error}</p>}

        <div className="mt-4 max-w-xl rounded-lg border border-hairline bg-surface shadow-e1">
          {loading && <p className="p-4 text-sm text-ink-3">กำลังโหลด...</p>}
          {!loading && holidays.length === 0 && <p className="p-4 text-sm text-ink-3">ยังไม่มีวันหยุด</p>}
          {holidays.map((h) => (
            <div key={h.id} className="flex items-center gap-4 border-b border-hairline px-4 py-3 last:border-0">
              <span className="w-28 font-mono text-xs text-ink-3">
                {new Date(h.holidayDate).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
              </span>
              <span className="flex-1 font-medium text-ink">{h.name}</span>
              <span className="text-xs text-ink-3">🔔 ล่วงหน้า {h.notifyDaysBefore} วัน</span>
              {canManage && (
                <button
                  onClick={() => setConfirmTarget(h)}
                  disabled={busyId === h.id}
                  className="text-xs font-medium text-rejected-fg hover:text-rejected-hover disabled:opacity-50"
                >
                  ลบ
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {showAdd && (
        <AddHolidayModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title="ลบวันหยุด"
          message={`ยืนยันลบวันหยุด "${confirmTarget.name}" ใช่หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้`}
          confirmLabel="ลบวันหยุด"
          busy={busyId === confirmTarget.id}
          onConfirm={() => handleDelete(confirmTarget.id)}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </AppShell>
  );
}

function AddHolidayModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [notifyDaysBefore, setNotifyDaysBefore] = useState("3");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createHoliday({ date, name, notifyDaysBefore: Number(notifyDaysBefore) });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มวันหยุดไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-e3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">เพิ่มวันหยุดประจำปี</h2>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="shrink-0 rounded-md p-1 text-ink-3 hover:bg-quiet-bg hover:text-ink-2"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label className="block">
            <span className="block text-sm font-medium text-ink-2">วันที่</span>
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-2">ชื่อวันหยุด</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-2">แจ้งเตือนล่วงหน้า (วัน)</span>
            <input
              required
              type="number"
              min={0}
              value={notifyDaysBefore}
              onChange={(e) => setNotifyDaysBefore(e.target.value)}
              className="mt-1 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm"
            />
          </label>

          {error && <p className="text-sm text-rejected-fg">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-hairline-strong px-4 py-2 text-sm text-ink">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
            >
              {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
