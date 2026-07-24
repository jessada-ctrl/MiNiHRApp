"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout, type AuthUser } from "@/lib/auth";
import {
  type DurationType,
  type LeaveRequest,
  type LeaveType,
  cancelLeaveRequest,
  listLeaveTypes,
  listMyRequests,
  submitLeaveRequest,
} from "@/lib/leaveRequests";
import { apiFetch, unwrap } from "@/lib/api";

interface QuotaSummary {
  leaveTypeId: string;
  name: string;
  allowHourly: boolean;
  requiresAttachmentAfterDays: number | null;
  total: number;
  used: number;
  pending: number;
  remaining: number;
}

const STATUS_LABEL: Record<LeaveRequest["status"], string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
  cancelled: "ยกเลิกแล้ว",
};
const STATUS_CLASS: Record<LeaveRequest["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-neutral-200 text-neutral-600",
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86400000);
}
function computeDays(duration: DurationType, startDate: string, endDate: string, startTime: string, endTime: string): number {
  if (duration === "full_day") return Math.max(0, daysBetween(startDate, endDate || startDate) + 1);
  if (duration === "half_am" || duration === "half_pm") return 0.5;
  const s = toMinutes(startTime), e = toMinutes(endTime);
  if (e <= s) return 0;
  const overlap = Math.max(0, Math.min(e, 780) - Math.max(s, 720));
  const mins = e - s - overlap;
  return Math.round((mins / 60 / 8) * 100) / 100;
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tab, setTab] = useState<"form" | "history">("form");
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [quotas, setQuotas] = useState<QuotaSummary[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [lts, qs, reqs] = await Promise.all([
      listLeaveTypes(),
      unwrap<QuotaSummary[]>(await apiFetch("/leave-requests/my-quota-summary")),
      listMyRequests(),
    ]);
    setLeaveTypes(lts);
    setQuotas(qs);
    setRequests(reqs);
  }, []);

  useEffect(() => {
    // FR-3.2: the Flex Message "🔎 ตรวจสอบ" button is a
    // https://liff.line.me/{liffId}/review/{id} URL. LINE does NOT
    // substitute that extra path directly into the final URL the way its
    // docs imply — confirmed by testing, it always opens this bare root
    // page — but it does show up as a `liff.state` query param on the
    // redirect (e.g. ?liff.state=%2Freview%2F{id}), which we read and
    // redirect from ourselves.
    const params = new URLSearchParams(window.location.search);
    const liffState = params.get("liff.state");
    if (liffState && liffState.startsWith("/")) {
      router.replace(liffState);
      return;
    }

    // Rich Menu's "ประวัติการลา" button deep-links here via ?tab=history.
    if (params.get("tab") === "history") setTab("history");

    let cancelled = false;
    getCurrentUser().then(async (u) => {
      if (cancelled) return;
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      await refresh();
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router, refresh]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (loading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-neutral-500">กำลังโหลด...</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-100">
      <header className="flex items-center justify-between bg-teal-700 px-4 py-3 text-white">
        <div>
          <p className="text-sm font-semibold">{user.fullName}</p>
          <p className="text-[11px] opacity-80">testco.minihr.io</p>
        </div>
        <button onClick={handleLogout} className="text-xs underline opacity-90">
          ออกจากระบบ
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {tab === "form" ? (
          <LeaveForm leaveTypes={leaveTypes} quotas={quotas} onSubmitted={refresh} onGoHistory={() => setTab("history")} />
        ) : (
          <HistoryList requests={requests} onChanged={refresh} />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 flex border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <TabButton active={tab === "form"} label="ขอลา" icon="📝" onClick={() => setTab("form")} />
        <TabButton active={tab === "history"} label="ประวัติ" icon="📜" onClick={() => setTab("history")} />
      </nav>
    </div>
  );
}

function TabButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
        active ? "text-teal-700" : "text-neutral-400"
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      {label}
    </button>
  );
}

function LeaveForm({
  leaveTypes,
  quotas,
  onSubmitted,
  onGoHistory,
}: {
  leaveTypes: LeaveType[];
  quotas: QuotaSummary[];
  onSubmitted: () => Promise<void>;
  onGoHistory: () => void;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [duration, setDuration] = useState<DurationType>("full_day");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [ackChecked, setAckChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!leaveTypeId && leaveTypes.length > 0) setLeaveTypeId(leaveTypes[0].id);
  }, [leaveTypes, leaveTypeId]);

  const selectedType = leaveTypes.find((t) => t.id === leaveTypeId);
  const quota = quotas.find((q) => q.leaveTypeId === leaveTypeId);
  const days = computeDays(duration, startDate, endDate, startTime, endTime);
  const willExceed = !!quota && days > quota.remaining;
  const needsAttachment = !!selectedType?.requiresAttachmentAfterDays && days >= 0.01; // real cumulative check happens server-side; this is a soft client hint
  const pct = quota && quota.total > 0 ? Math.min(100, ((quota.used + quota.pending + (willExceed ? 0 : days)) / quota.total) * 100) : 0;

  useEffect(() => {
    if (duration === "hourly" && selectedType && !selectedType.allowHourly) setDuration("full_day");
  }, [selectedType, duration]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await submitLeaveRequest({
        leaveTypeId,
        durationType: duration,
        startDate,
        endDate: duration === "full_day" ? endDate : undefined,
        startTime: duration === "hourly" ? startTime : undefined,
        endTime: duration === "hourly" ? endTime : undefined,
        reason: reason || undefined,
        attachmentUrl: attachmentName ? `mock://${attachmentName}` : undefined,
        lwopAcknowledged: ackChecked,
      });
      setReason("");
      setAttachmentName("");
      setAckChecked(false);
      await onSubmitted();
      onGoHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = leaveTypeId && days > 0 && (!willExceed || ackChecked);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <label className="mb-1 block text-sm font-medium text-neutral-700">ประเภทการลา</label>
        <select
          value={leaveTypeId}
          onChange={(e) => setLeaveTypeId(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
        >
          {leaveTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <label className="mb-2 block text-sm font-medium text-neutral-700">ช่วงเวลา</label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["full_day", "เต็มวัน"],
              ["half_am", "ครึ่งวันเช้า"],
              ["half_pm", "ครึ่งวันบ่าย"],
              ...(selectedType?.allowHourly ? ([["hourly", "รายชั่วโมง"]] as const) : []),
            ] as [DurationType, string][]
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setDuration(val)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                duration === val ? "border-teal-700 bg-teal-700 text-white" : "border-neutral-300 text-neutral-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {duration === "full_day" ? (
            <>
              <DateField label="วันที่เริ่มลา" value={startDate} onChange={setStartDate} />
              <DateField label="วันที่สิ้นสุด" value={endDate} onChange={setEndDate} />
            </>
          ) : (
            <DateField label="วันที่ลา" value={startDate} onChange={setStartDate} />
          )}
          {duration === "hourly" && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-neutral-500">เวลาเริ่ม</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-neutral-500">เวลาสิ้นสุด</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
          {duration === "hourly" && (
            <p className="text-[11px] text-neutral-400">⏱ ระบบหักเวลาพักเที่ยง (12:00–13:00 น.) ให้อัตโนมัติ</p>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <label className="mb-1 block text-sm font-medium text-neutral-700">เหตุผลการลา</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          placeholder="ระบุเหตุผลโดยย่อ"
        />
      </div>

      {quota && (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="mb-1 flex justify-between text-xs text-neutral-500">
            <span>โควตา {quota.name}</span>
            <span className="tabular-nums font-medium text-neutral-800">
              {quota.remaining} / {quota.total} วันคงเหลือ
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200">
            <div
              className={`h-full rounded-full ${willExceed ? "bg-red-500" : "bg-teal-600"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-neutral-500">
            <span>คำขอนี้</span>
            <span className="tabular-nums font-medium text-neutral-800">{days} วัน</span>
          </div>
        </div>
      )}

      {willExceed && (
        <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">
          ⚠️ คำขอนี้เกินโควตาคงเหลือ
          <label className="mt-2 flex items-start gap-2">
            <input type="checkbox" checked={ackChecked} onChange={(e) => setAckChecked(e.target.checked)} className="mt-0.5" />
            <span>การลาครั้งนี้เกินโควตาและยินยอมให้ HR พิจารณาหักค่าจ้าง (LWOP)</span>
          </label>
        </div>
      )}

      {needsAttachment && (
        <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          📎 ประเภทการลานี้อาจต้องแนบใบรับรองแพทย์หากลาสะสมครบ {selectedType?.requiresAttachmentAfterDays} วันในรอบ 30 วัน — ระบบจะตรวจสอบอีกครั้งตอนส่ง
          <button
            type="button"
            onClick={() => setAttachmentName(`certificate-${Date.now()}.jpg`)}
            className="mt-2 block w-full rounded-lg border border-dashed border-amber-400 py-2 text-center"
          >
            {attachmentName ? `📄 ${attachmentName} (แนบแล้ว)` : "แตะเพื่อแนบไฟล์ (จำลอง)"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="sticky bottom-20 w-full rounded-xl bg-teal-700 py-3.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50"
      >
        {submitting ? "กำลังส่งคำขอ..." : "ส่งคำขอลา"}
      </button>
    </form>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-neutral-500">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function HistoryList({ requests, onChanged }: { requests: LeaveRequest[]; onChanged: () => Promise<void> }) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCancel(id: string) {
    setBusyId(id);
    try {
      await cancelLeaveRequest(id);
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0) {
    return <p className="p-6 text-center text-sm text-neutral-400">ยังไม่มีประวัติการลา</p>;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {requests.map((r) => {
        const canCancel = r.status === "pending" && r.approvalActions.length === 0;
        const rejection = r.approvalActions.find((a) => a.action === "reject");
        return (
          <div key={r.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-neutral-900">{r.leaveType.name}</p>
                <p className="text-xs text-neutral-500">
                  {new Date(r.startDatetime).toLocaleDateString("th-TH")} – {new Date(r.endDatetime).toLocaleDateString("th-TH")} · {r.totalDays} วัน
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[r.status]}`}>
                {STATUS_LABEL[r.status]}
              </span>
            </div>
            {r.status === "pending" && (
              <p className="mt-1 text-[11px] text-neutral-400">
                📍 รอ: {r.workflowSnapshot[r.currentStep]?.label ?? "ผู้อนุมัติ"}
              </p>
            )}
            {rejection && (
              <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">เหตุผลที่ปฏิเสธ: {rejection.comment}</div>
            )}
            {canCancel && (
              <button
                onClick={() => handleCancel(r.id)}
                disabled={busyId === r.id}
                className="mt-3 w-full rounded-lg border border-neutral-300 py-2 text-xs font-medium text-neutral-600 disabled:opacity-50"
              >
                {busyId === r.id ? "กำลังยกเลิก..." : "ยกเลิกคำขอ"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
