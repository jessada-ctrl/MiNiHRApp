"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
    <main className="min-h-screen bg-neutral-50">
      <header className="flex items-center gap-4 border-b border-neutral-200 bg-white px-6 py-4">
        <Link href="/dashboard" className="text-lg font-semibold text-teal-800">
          MiniHR
        </Link>
        <span className="text-neutral-300">/</span>
        <span className="text-sm text-neutral-600">รออนุมัติ</span>
      </header>

      <div className="p-6">
        <h1 className="text-xl font-semibold text-neutral-900">คำขอลาที่รออนุมัติ</h1>
        <p className="mt-1 text-sm text-neutral-500">แสดงเฉพาะคำขอที่ถึงคิวคุณในขั้นตอนปัจจุบัน</p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {loading && <p className="mt-4 text-sm text-neutral-400">กำลังโหลด...</p>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!loading && requests.length === 0 && (
            <p className="col-span-full text-sm text-neutral-400">🎉 ไม่มีคำขอค้างพิจารณาในขณะนี้</p>
          )}
          {requests.map((r) => (
            <button
              key={r.id}
              onClick={() => setReviewing(r)}
              className="rounded-lg border border-neutral-200 bg-white p-4 text-left shadow-sm hover:border-teal-300"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-neutral-900">{r.employee.fullName}</p>
                  <p className="text-xs text-neutral-500">{r.leaveType.name} · {DURATION_LABEL[r.durationType]}</p>
                </div>
                {r.isOverQuota && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">เกินโควตา</span>
                )}
              </div>
              <p className="mt-2 text-xs text-neutral-600">
                {new Date(r.startDatetime).toLocaleDateString("th-TH")} – {new Date(r.endDatetime).toLocaleDateString("th-TH")} ·{" "}
                <span className="tabular-nums font-medium">{r.totalDays}</span> วัน
              </p>
              <p className="mt-1 text-[11px] text-neutral-400">ขั้นที่ {r.currentStep + 1}/{r.workflowSnapshot.length}</p>
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
    </main>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-800">
            {request.employee.fullName.charAt(0)}
          </span>
          <div>
            <h2 className="font-semibold text-neutral-900">{request.employee.fullName}</h2>
            <p className="text-xs text-neutral-500">ตรวจสอบคำขอลา</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-400">ประเภท</dt>
          <dd>{request.leaveType.name}</dd>
          <dt className="text-neutral-400">ช่วงเวลา</dt>
          <dd>
            {new Date(request.startDatetime).toLocaleDateString("th-TH")} – {new Date(request.endDatetime).toLocaleDateString("th-TH")}
          </dd>
          <dt className="text-neutral-400">จำนวน</dt>
          <dd className="tabular-nums">{request.totalDays} วัน</dd>
          <dt className="text-neutral-400">เหตุผล</dt>
          <dd>{request.reason || "-"}</dd>
          {request.isOverQuota && (
            <>
              <dt className="text-neutral-400">หมายเหตุ</dt>
              <dd className="text-red-600">เกินโควตา · พนักงานยอมรับเงื่อนไข LWOP แล้ว</dd>
            </>
          )}
        </dl>

        <div className="mt-4 border-t border-neutral-100 pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">ไทม์ไลน์การพิจารณา</h3>
          {request.approvalActions.length === 0 ? (
            <p className="text-xs text-neutral-400">ยังไม่มีผู้อนุมัติดำเนินการ — คุณคือขั้นแรก</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {request.approvalActions.map((a, i) => (
                <li key={i} className="text-xs">
                  <span className="font-medium">{a.approver.fullName}</span> —{" "}
                  {a.action === "approve" ? "✅ อนุมัติ" : "❌ ปฏิเสธ"}{" "}
                  <span className="text-neutral-400">· {new Date(a.actedAt).toLocaleString("th-TH")}</span>
                  {a.comment && <div className="mt-0.5 rounded bg-neutral-50 px-2 py-1 text-neutral-600">{a.comment}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {rejecting ? (
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-neutral-700">เหตุผลการปฏิเสธ (จำเป็นต้องกรอก)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => setRejecting(false)} className="flex-1 rounded-md border border-neutral-300 py-2 text-sm">
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
                className="flex-1 rounded-md bg-teal-700 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
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
