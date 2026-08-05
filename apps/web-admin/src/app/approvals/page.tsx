"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { StatusBadge } from "@/components/ui/Badge";
import { ApprovalTimeline, type TimelineStep } from "@/components/ui/Timeline";
import {
  type LeaveRequest,
  approveLeaveRequest,
  listPendingForMe,
  rejectLeaveRequest,
} from "@/lib/leaveRequests";

const DURATION_LABEL: Record<string, string> = {
  full_day: "เต็มวัน",
  half_am: "ครึ่งวันเช้า",
  half_pm: "ครึ่งวันบ่าย",
  hourly: "รายชั่วโมง",
};

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<LeaveRequest | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setRequests(await listPendingForMe());
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AppShell title="รออนุมัติ">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">คำขอลาที่รออนุมัติ</h1>
        <p className="mt-1 text-sm text-ink-3">แสดงเฉพาะคำขอที่ถึงคิวคุณในขั้นตอนปัจจุบัน</p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {loading && <p className="mt-4 text-sm text-ink-3">กำลังโหลด...</p>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!loading && requests.length === 0 && (
            <p className="col-span-full text-sm text-ink-3">🎉 ไม่มีคำขอค้างพิจารณาในขณะนี้</p>
          )}
          {requests.map((r) => (
            <button
              key={r.id}
              onClick={() => setReviewing(r)}
              className="rounded-lg border border-hairline bg-surface p-4 text-left shadow-e1 transition-shadow hover:shadow-e2 hover:border-brand-300"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-ink">{r.employee.fullName}</p>
                  <p className="text-xs text-ink-3">{r.leaveType.name} · {DURATION_LABEL[r.durationType]}</p>
                </div>
                {r.isOverQuota && <StatusBadge status="risk">เกินโควตา</StatusBadge>}
              </div>
              <p className="mt-2 text-xs text-ink-2">
                {new Date(r.startDatetime).toLocaleDateString("th-TH")} – {new Date(r.endDatetime).toLocaleDateString("th-TH")} ·{" "}
                <span className="tabular-nums font-medium">{r.totalDays}</span> วัน
              </p>
              <p className="mt-1 text-[11px] text-ink-3">ขั้นที่ {r.currentStep + 1}/{r.workflowSnapshot.length}</p>
            </button>
          ))}
        </div>
      </div>

      {reviewing && (
        <ReviewModal
          request={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setReviewing(null);
            refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function ReviewModal({
  request,
  onClose,
  onDone,
}: {
  request: LeaveRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      await approveLeaveRequest(request.id);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อนุมัติไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!comment.trim()) {
      setError("กรุณาระบุเหตุผลการปฏิเสธ");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rejectLeaveRequest(request.id, comment.trim());
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ปฏิเสธไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg bg-surface p-6 shadow-e3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {request.employee.fullName.charAt(0)}
            </span>
            <div>
              <h2 className="font-semibold text-ink">{request.employee.fullName}</h2>
              <p className="text-xs text-ink-3">ตรวจสอบคำขอลา</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="shrink-0 rounded-md p-1 text-ink-3 hover:bg-quiet-bg hover:text-ink-2"
          >
            ✕
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-3">ประเภท</dt>
          <dd>{request.leaveType.name}</dd>
          <dt className="text-ink-3">ช่วงเวลา</dt>
          <dd>
            {new Date(request.startDatetime).toLocaleDateString("th-TH")} – {new Date(request.endDatetime).toLocaleDateString("th-TH")}
          </dd>
          <dt className="text-ink-3">จำนวน</dt>
          <dd className="tabular-nums">{request.totalDays} วัน</dd>
          <dt className="text-ink-3">เหตุผล</dt>
          <dd>{request.reason || "-"}</dd>
          {request.isOverQuota && (
            <>
              <dt className="text-ink-3">หมายเหตุ</dt>
              <dd className="text-red-600">เกินโควตา · พนักงานยอมรับเงื่อนไข LWOP แล้ว</dd>
            </>
          )}
        </dl>

        <div className="mt-4 border-t border-hairline pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">ไทม์ไลน์การพิจารณา</h3>
          {request.approvalActions.length === 0 ? (
            <p className="text-xs text-ink-3">ยังไม่มีผู้อนุมัติดำเนินการ — คุณคือขั้นแรก</p>
          ) : (
            <ApprovalTimeline
              steps={request.approvalActions.map(
                (a, i): TimelineStep => ({
                  id: i,
                  label: `${a.approver.fullName} — ${a.action === "approve" ? "✅ อนุมัติ" : "❌ ปฏิเสธ"}`,
                  state: a.action === "approve" ? "approved" : "rejected",
                  timestamp: new Date(a.actedAt).toLocaleString("th-TH"),
                  comment: a.comment || undefined,
                })
              )}
            />
          )}
        </div>

        {rejecting ? (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-ink-2">เหตุผลการปฏิเสธ (จำเป็นต้องกรอก)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-hairline-strong px-3 py-2 text-sm"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => setRejecting(false)} className="flex-1 rounded-md border border-hairline-strong py-2 text-sm">
                ยกเลิก
              </button>
              <button
                onClick={handleReject}
                disabled={busy}
                className="flex-1 rounded-md bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? "กำลังบันทึก..." : "ยืนยันปฏิเสธ"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setRejecting(true)}
                className="flex-1 rounded-md bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700"
              >
                ❌ ปฏิเสธ
              </button>
              <button
                onClick={handleApprove}
                disabled={busy}
                className="flex-1 rounded-md bg-brand-500 py-2.5 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
              >
                {busy ? "กำลังบันทึก..." : "✅ อนุมัติ"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
