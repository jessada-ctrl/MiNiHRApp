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
import { completePendingLiffLogin, scanQrCode } from "@/lib/liff";
import {
  type AttendanceStatus,
  type CheckResult,
  checkGps,
  checkQr,
  getAttendanceStatus,
} from "@/lib/attendance";

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
  const [tab, setTab] = useState<"checkin" | "form" | "history">("checkin");
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [quotas, setQuotas] = useState<QuotaSummary[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    const params = new URLSearchParams(window.location.search);

    // Rich Menu's "ขอลา" and "ประวัติการลา" buttons deep-link here via
    // ?tab=form / ?tab=history; the bare URL (its "ลงเวลาทำงาน" button, and
    // the LIFF app's own root) defaults to the check-in tab per FR-2.3.
    if (params.get("tab") === "history") setTab("history");
    else if (params.get("tab") === "form") setTab("form");

    let cancelled = false;
    (async () => {
      try {
        // Must run before anything else on this page, including the
        // liff.state redirect below: this is where a liff.login() redirect
        // (started from e.g. /register) always lands, and it's the only
        // chance the SDK gets to persist that login — otherwise isLoggedIn()
        // reports false forever afterward, even on later visits. See
        // completePendingLiffLogin's doc comment for why this can't just
        // live on the page that called login().
        //
        // This used to run *after* the liff.state early-return below, which
        // meant any callback that happened to carry a liff.state param (in
        // practice, every liff.login() redirect does) bailed out of this
        // effect before completePendingLiffLogin() ever ran — silently
        // dropping the login callback and reproducing the "isLoggedIn()
        // never becomes true" bug on every single attempt, no matter how
        // many times the user retried.
        //
        // Bounded with a timeout: liff.init() has been observed to hang
        // indefinitely (never resolving or rejecting) while processing an
        // OAuth callback in some external-browser cases — this must never be
        // allowed to block the rest of the page (and the user) forever.
        await Promise.race([completePendingLiffLogin(), new Promise((resolve) => setTimeout(resolve, 4000))]);
        if (cancelled) return;

        // FR-3.2: the Flex Message "🔎 ตรวจสอบ" button is a
        // https://liff.line.me/{liffId}/review/{id} URL. LINE does NOT
        // substitute that extra path directly into the final URL the way its
        // docs imply — confirmed by testing, it always opens this bare root
        // page — but it does show up as a `liff.state` query param on the
        // redirect (e.g. ?liff.state=%2Freview%2F{id}), which we read and
        // redirect from ourselves.
        const liffState = params.get("liff.state");
        if (liffState && liffState.startsWith("/")) {
          router.replace(liffState);
          return;
        }

        const u = await getCurrentUser();
        if (cancelled) return;
        if (!u) {
          // A liff.login() redirect (e.g. from /register's OTP step) always
          // lands back here with no app session yet — send the user back to
          // whatever page asked for that login instead of dumping them on
          // /login, which is for already-registered accounts.
          const returnTo = sessionStorage.getItem("liff-return-to");
          sessionStorage.removeItem("liff-return-to");
          router.replace(returnTo && returnTo.startsWith("/") ? returnTo : "/login");
          return;
        }
        setUser(u);
        await refresh();
        if (!cancelled) setLoading(false);
      } catch {
        // Network hiccup (tunnel down, backend not reachable, etc.) — surface
        // an error with a retry instead of leaving "กำลังโหลด..." stuck forever.
        if (!cancelled) setLoadError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, refresh]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (loadError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
        <p className="text-sm text-neutral-500">{loadError}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white"
        >
          ลองใหม่
        </button>
      </main>
    );
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
      <header className="flex items-center justify-between bg-gradient-to-r from-sky-500 to-amber-400 px-4 py-3 text-white">
        <div>
          <p className="text-sm font-semibold">{user.fullName}</p>
          <p className="text-[11px] opacity-80">testco.lala.io</p>
        </div>
        <button onClick={handleLogout} className="text-xs underline opacity-90">
          ออกจากระบบ
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        {tab === "checkin" ? (
          <AttendanceTab />
        ) : tab === "form" ? (
          <LeaveForm leaveTypes={leaveTypes} quotas={quotas} onSubmitted={refresh} onGoHistory={() => setTab("history")} />
        ) : (
          <HistoryList requests={requests} onChanged={refresh} />
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 flex border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <TabButton active={tab === "checkin"} label="เข้างาน" icon="⏱️" onClick={() => setTab("checkin")} />
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
        active ? "text-sky-700" : "text-neutral-400"
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      {label}
    </button>
  );
}

function AttendanceTab() {
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CheckResult | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getAttendanceStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleScanQr() {
    setError(null);
    setBusy(true);
    try {
      let token: string | null;
      try {
        token = await scanQrCode();
      } catch (err) {
        // LIFF camera isn't available outside the real LINE app (e.g. this
        // local checkout before FR-2.1's LINE integration is wired up) —
        // fall back to typing the code, same "mock://" pattern the leave
        // request attachment upload already uses for the same reason.
        if (err instanceof Error && err.message === "LIFF_NOT_CONFIGURED") {
          token = window.prompt("จำลองการสแกน QR — วางรหัส QR Code ที่ได้จาก HR");
        } else {
          throw err;
        }
      }
      if (!token) return;
      const result = await checkQr(token);
      setLastResult(result);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สแกน QR ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleUseGps() {
    setError(null);
    setBusy(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 }),
      );
      const result = await checkGps(position.coords.latitude, position.coords.longitude);
      setLastResult(result);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อ่านพิกัด GPS ไม่สำเร็จ — กรุณาเปิดสิทธิ์การเข้าถึงตำแหน่ง");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-neutral-500">กำลังโหลด...</p>
      </div>
    );
  }

  const branch = status?.branch ?? null;
  const nextAction = status?.nextAction ?? "in";
  const timeStr = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-center">
        <p className="text-4xl font-semibold tabular-nums text-neutral-900">{timeStr}</p>
        <p className="mt-1 text-sm text-neutral-500">{dateStr}</p>
      </div>

      {lastResult ? (
        <SuccessCard result={lastResult} onDismiss={() => setLastResult(null)} />
      ) : (
        <>
          <button
            onClick={handleScanQr}
            disabled={busy}
            className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-600 bg-neutral-900 text-white disabled:opacity-60"
          >
            <span className="text-3xl">▢</span>
            <span className="text-sm text-neutral-300">แตะเพื่อเริ่มสแกน QR</span>
          </button>

          <button
            onClick={handleScanQr}
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 py-3.5 text-sm font-semibold text-white shadow-lg disabled:opacity-60"
          >
            {busy ? "กำลังดำเนินการ..." : `📷 สแกน QR ${nextAction === "in" ? "เข้างาน" : "ออกงาน"}`}
          </button>

          <button
            onClick={handleUseGps}
            disabled={busy}
            className="text-center text-sm font-medium text-sky-700 underline disabled:opacity-60"
          >
            ใช้พิกัด GPS แทน
          </button>
        </>
      )}

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      {branch && (
        <div className="flex items-center gap-2 rounded-xl bg-white p-3 text-xs text-neutral-500 shadow-sm">
          <span>📍</span>
          <span>
            {branch.branchName} · รัศมีที่อนุญาต {branch.radiusMeters} ม.
          </span>
        </div>
      )}

      {status && status.todayLogs.length > 0 && (
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-medium text-neutral-500">การลงเวลาวันนี้</p>
          <ul className="flex flex-col gap-1.5">
            {status.todayLogs.map((log) => (
              <li key={log.id} className="flex justify-between text-xs text-neutral-600">
                <span>{log.checkType === "in" ? "เข้างาน" : "ออกงาน"}</span>
                <span className="tabular-nums">
                  {new Date(log.timestamp).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SuccessCard({ result, onDismiss }: { result: CheckResult; onDismiss: () => void }) {
  const timeStr = new Date(result.timestamp).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 text-center shadow-sm">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-2xl text-white">✓</span>
      <p className="text-base font-semibold text-neutral-900">{result.checkType === "in" ? "เช็คอินสำเร็จ" : "เช็คเอาท์สำเร็จ"}</p>
      <p className="text-xs text-neutral-500">
        {timeStr} น. · {result.branch.branchName}
      </p>
      {result.distanceMeters !== undefined && (
        <div className="mt-1 w-full rounded-lg bg-green-50 p-2 text-xs text-green-700">
          ✓ ยืนยันพิกัดสำเร็จ — อยู่ห่างจากสาขา {result.distanceMeters} ม. (ในรัศมีที่กำหนด {result.branch.radiusMeters} ม.)
        </div>
      )}
      <button onClick={onDismiss} className="mt-2 text-xs font-medium text-sky-700 underline">
        กลับไปหน้าเช็คอิน
      </button>
    </div>
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
                duration === val ? "border-sky-700 bg-sky-700 text-white" : "border-neutral-300 text-neutral-600"
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
              className={`h-full rounded-full ${willExceed ? "bg-red-500" : "bg-gradient-to-r from-sky-400 to-amber-300"}`}
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
        className="sticky bottom-20 w-full rounded-xl bg-gradient-to-r from-sky-500 to-amber-400 py-3.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50"
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
