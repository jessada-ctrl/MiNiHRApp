"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  type LeaveType,
  createLeaveType,
  deleteLeaveType,
  listLeaveTypes,
  updateLeaveType,
} from "@/lib/leaveTypes";

export default function LeaveTypesPage() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<LeaveType | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setLeaveTypes(await listLeaveTypes());
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleFieldSave(
    id: string,
    field: "defaultQuota" | "requiresAttachmentAfterDays",
    rawValue: string,
  ) {
    setSavingId(id);
    setRowError((r) => ({ ...r, [id]: "" }));
    try {
      if (field === "defaultQuota") {
        const n = Number(rawValue);
        if (Number.isNaN(n) || n < 0) throw new Error("โควตาต้องเป็นตัวเลขไม่ติดลบ");
        await updateLeaveType(id, { defaultQuota: n });
      } else {
        const n = rawValue.trim() === "" ? null : Number(rawValue);
        if (n !== null && (Number.isNaN(n) || n < 0)) throw new Error("จำนวนวันต้องเป็นตัวเลขไม่ติดลบ");
        await updateLeaveType(id, { requiresAttachmentAfterDays: n });
      }
      await refresh();
    } catch (err) {
      setRowError((r) => ({ ...r, [id]: err instanceof Error ? err.message : "บันทึกไม่สำเร็จ" }));
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggleHourly(id: string, allowHourly: boolean) {
    setSavingId(id);
    try {
      await updateLeaveType(id, { allowHourly });
      await refresh();
    } catch (err) {
      setRowError((r) => ({ ...r, [id]: err instanceof Error ? err.message : "บันทึกไม่สำเร็จ" }));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    setSavingId(id);
    setRowError((r) => ({ ...r, [id]: "" }));
    try {
      await deleteLeaveType(id);
      setConfirmTarget(null);
      await refresh();
    } catch (err) {
      setRowError((r) => ({ ...r, [id]: err instanceof Error ? err.message : "ลบไม่สำเร็จ" }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AppShell
      title="ประเภทการลา"
      actions={
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600"
        >
          + เพิ่มประเภทการลา
        </button>
      }
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">ประเภทการลา</h1>
        <p className="mt-1 text-sm text-ink-3">
          การแก้ไขโควตามาตรฐานที่นี่มีผลกับพนักงานที่เพิ่มใหม่เท่านั้น ไม่ย้อนเปลี่ยนโควตาของพนักงานปัจจุบัน — ปรับรายบุคคลได้ที่หน้า{" "}
          <Link href="/employees" className="text-brand-600 underline">
            พนักงาน
          </Link>
        </p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-4 overflow-x-auto rounded-lg border border-hairline bg-surface shadow-e1">
          <table className="min-w-full divide-y divide-hairline text-sm">
            <thead className="bg-surface-2">
              <tr>
                <Th>ประเภทการลา</Th>
                <Th>โควตามาตรฐาน/ปี (วัน)</Th>
                <Th>บังคับแนบเอกสารเมื่อสะสม ≥ (วัน)</Th>
                <Th>ลารายชั่วโมงได้</Th>
                <Th></Th>
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
              {!loading &&
                leaveTypes.map((lt) => (
                  <tr key={lt.id}>
                    <td className="px-4 py-3 font-medium text-ink">{lt.name}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        defaultValue={lt.defaultQuota}
                        disabled={savingId === lt.id}
                        onBlur={(e) => {
                          if (e.target.value !== lt.defaultQuota) handleFieldSave(lt.id, "defaultQuota", e.target.value);
                        }}
                        className="w-24 rounded-md border border-hairline-strong px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        placeholder="ไม่บังคับ"
                        defaultValue={lt.requiresAttachmentAfterDays ?? ""}
                        disabled={savingId === lt.id}
                        onBlur={(e) => {
                          const current = lt.requiresAttachmentAfterDays == null ? "" : String(lt.requiresAttachmentAfterDays);
                          if (e.target.value !== current) handleFieldSave(lt.id, "requiresAttachmentAfterDays", e.target.value);
                        }}
                        className="w-28 rounded-md border border-hairline-strong px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={lt.allowHourly}
                        disabled={savingId === lt.id}
                        onChange={(e) => handleToggleHourly(lt.id, e.target.checked)}
                        className="h-4 w-4 accent-brand-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setConfirmTarget(lt)}
                        disabled={savingId === lt.id}
                        className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        ลบ
                      </button>
                      {rowError[lt.id] && <p className="mt-1 text-xs text-red-600">{rowError[lt.id]}</p>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <AddLeaveTypeModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title="ลบประเภทการลา"
          message={`ยืนยันลบประเภทการลา "${confirmTarget.name}" ใช่หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้`}
          confirmLabel="ลบประเภทการลา"
          busy={savingId === confirmTarget.id}
          onConfirm={() => handleDelete(confirmTarget.id)}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
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

function AddLeaveTypeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [defaultQuota, setDefaultQuota] = useState("5");
  const [requiresAttachmentAfterDays, setRequiresAttachmentAfterDays] = useState("");
  const [allowHourly, setAllowHourly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createLeaveType({
        name,
        defaultQuota: Number(defaultQuota),
        requiresAttachmentAfterDays: requiresAttachmentAfterDays.trim() === "" ? null : Number(requiresAttachmentAfterDays),
        allowHourly,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มประเภทการลาไม่สำเร็จ");
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
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-e3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">เพิ่มประเภทการลา</h2>
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
            <span className="block text-sm font-medium text-ink-2">ชื่อประเภทการลา</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-2">โควตามาตรฐาน/ปี (วัน)</span>
            <input
              required
              type="number"
              min={0}
              step={0.5}
              value={defaultQuota}
              onChange={(e) => setDefaultQuota(e.target.value)}
              className="mt-1 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-2">บังคับแนบเอกสารเมื่อสะสม ≥ (วัน, เว้นว่าง = ไม่บังคับ)</span>
            <input
              type="number"
              min={0}
              value={requiresAttachmentAfterDays}
              onChange={(e) => setRequiresAttachmentAfterDays(e.target.value)}
              className="mt-1 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowHourly}
              onChange={(e) => setAllowHourly(e.target.checked)}
              className="h-4 w-4 accent-brand-500"
            />
            <span className="text-sm text-ink-2">อนุญาตให้ลารายชั่วโมง</span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

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
