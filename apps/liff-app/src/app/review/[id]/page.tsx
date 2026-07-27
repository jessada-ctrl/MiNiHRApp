"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { type PendingApproval, approveLeaveRequest, listPendingForMe, rejectLeaveRequest } from "@/lib/approvals";

const DURATION_LABEL: Record<string, string> = {
  full_day: "เต็มวัน",
  half_am: "ครึ่งวันเช้า",
  half_pm: "ครึ่งวันบ่าย",
  hourly: "รายชั่วโมง",
};

export default function ReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<PendingApproval | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const u = await getCurrentUser();
      if (cancelled) return;
      if (!u) {
        router.replace("/login");
        return;
      }
      setLoading(true);
      try {
        const pending = await listPendingForMe();
        if (cancelled) return;
        setRequest(pending.find((r) => r.id === params.id) ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // Mobile browsers (notably LINE's in-app browser) can restore this page
    // from back-forward cache showing the exact pre-click UI — the approve/
    // reject already went through, but the cached DOM makes it look like
    // nothing happened. Re-checking on every pageshow (not just first mount)
    // forces a fresh read of the real status instead of the stale snapshot.
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) load();
    }
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [params.id, router]);

  async function handleApprove() {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      await approveLeaveRequest(request.id);
      setDone("approved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "อนุมัติไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!request) return;
    if (!comment.trim()) {
      setError("กรุณาระบุเหตุผลการปฏิเสธ");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await rejectLeaveRequest(request.id, comment.trim());
      setDone("rejected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ปฏิเสธไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-neutral-100">
        <p className="text-sm text-neutral-500">กำลังโหลด...</p>
      </main>
    );
  }

  if (done) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-neutral-100 px-5 text-center">
        <div className="text-4xl">{done === "approved" ? "✅" : "❌"}</div>
        <p className="text-sm font-medium text-neutral-800">
          {done === "approved" ? "อนุมัติคำขอลาเรียบร้อยแล้ว" : "ปฏิเสธคำขอลาเรียบร้อยแล้ว"}
        </p>
      </main>
    );
  }

  if (!request) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 bg-neutral-100 px-5 text-center">
        <p className="text-sm text-neutral-500">ไม่พบคำขอนี้ในคิวของคุณ — อาจมีคนดำเนินการไปแล้ว หรือไม่ใช่คำขอที่ถึงคิวคุณ</p>
        <button onClick={() => router.push("/")} className="mt-2 text-xs text-sky-700 underline">
          กลับหน้าแรก
        </button>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-neutral-100 px-4 py-5">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-800">
                {request.employee.fullName.charAt(0)}
              </span>
              <div>
                <h1 className="font-semibold text-neutral-900">{request.employee.fullName}</h1>
                <p className="text-xs text-neutral-500">ตรวจสอบคำขอลา</p>
              </div>
            </div>
            {request.isOverQuota && (
              <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">เกินโควตา</span>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-neutral-400">ประเภท</dt>
            <dd>{request.leaveType.name}</dd>
            <dt className="text-neutral-400">ช่วงเวลา</dt>
            <dd>
              {new Date(request.startDatetime).toLocaleDateString("th-TH")} – {new Date(request.endDatetime).toLocaleDateString("th-TH")}
            </dd>
            <dt className="text-neutral-400">รูปแบบ</dt>
            <dd>{DURATION_LABEL[request.durationType] ?? request.durationType}</dd>
            <dt className="text-neutral-400">จำนวน</dt>
            <dd className="tabular-nums">{request.totalDays} วัน</dd>
            <dt className="text-neutral-400">เหตุผล</dt>
            <dd>{request.reason || "-"}</dd>
          </dl>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">ไทม์ไลน์การพิจารณา</h2>
          {request.approvalActions.length === 0 ? (
            <p className="text-xs text-neutral-400">ยังไม่มีผู้อนุมัติดำเนินการ — คุณคือขั้นแรก</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {request.approvalActions.map((a, i) => (
                <li key={i} className="text-xs">
                  <span className="font-medium">{a.approver.fullName}</span> — {a.action === "approve" ? "✅ อนุมัติ" : "❌ ปฏิเสธ"}{" "}
                  <span className="text-neutral-400">· {new Date(a.actedAt).toLocaleString("th-TH")}</span>
                  {a.comment && <div className="mt-0.5 rounded bg-neutral-50 px-2 py-1 text-neutral-600">{a.comment}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          {rejecting ? (
            <>
              <label className="mb-1 block text-sm font-medium text-neutral-700">เหตุผลการปฏิเสธ (จำเป็นต้องกรอก)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    setRejecting(false);
                    setError(null);
                  }}
                  className="flex-1 rounded-lg border border-neutral-300 py-2.5 text-sm"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleReject}
                  disabled={busy}
                  className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busy ? "กำลังบันทึก..." : "ยืนยันปฏิเสธ"}
                </button>
              </div>
            </>
          ) : (
            <>
              {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setRejecting(true)}
                  className="flex-1 rounded-lg bg-red-600 py-3 text-sm font-medium text-white"
                >
                  ❌ ปฏิเสธ
                </button>
                <button
                  onClick={handleApprove}
                  disabled={busy}
                  className="flex-1 rounded-lg bg-sky-700 py-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busy ? "กำลังบันทึก..." : "✅ อนุมัติ"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
