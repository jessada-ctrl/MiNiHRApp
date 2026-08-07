"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { getMyProfile, updateMyProfile, type MyProfile } from "@/lib/employees";

export default function ProfilePage() {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setFullName(p.fullName);
        setEmail(p.email);
        setPhone(p.phone ?? "");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The success toast auto-dismisses. Keyed by `saved` so a second save
  // re-triggers the enter animation instead of leaving a stale banner up.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3500);
    return () => clearTimeout(t);
  }, [saved]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const updated = await updateMyProfile({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
      });
      setProfile(updated);
      setFullName(updated.fullName);
      setEmail(updated.email);
      setPhone(updated.phone ?? "");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="ข้อมูลของฉัน">
      {/* Fixed, so it stays visible wherever the form was scrolled to when the
          save landed. The live region is always mounted — a screen reader only
          announces content that appears *inside* an existing one, so mounting
          region and message together would announce nothing. The wrapper does
          the centering; the pill owns the transform the animation drives. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4"
      >
        {saved && (
          <p className="animate-toast-in flex items-center gap-2 rounded-full border border-approved bg-approved-bg px-4 py-2 text-sm font-medium text-approved-fg shadow-e2">
            <span aria-hidden="true">✓</span>
            อัปเดตข้อมูลเรียบร้อยแล้ว
          </p>
        )}
      </div>

      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">ข้อมูลของฉัน</h1>
        <p className="mt-1 text-sm text-ink-3">
          แก้ไขชื่อ อีเมล และเบอร์โทรของตัวเองได้ — รหัสพนักงาน ตำแหน่ง แผนก สาขา และบทบาท
          ต้องให้ฝ่ายบุคคลเป็นผู้แก้ไข
        </p>

        {loading && <p className="mt-4 text-sm text-ink-3">กำลังโหลด...</p>}

        {!loading && profile && (
          <>
            <dl className="mt-4 flex flex-col gap-2 rounded-lg border border-hairline bg-surface p-4 text-sm shadow-e1">
              <Row label="รหัสพนักงาน" value={profile.employeeCode} mono />
              <Row label="ตำแหน่ง" value={profile.position ?? "-"} />
              <Row label="แผนก" value={profile.department?.departmentName ?? "-"} />
              <Row label="สาขา" value={profile.branch?.branchName ?? "-"} />
            </dl>

            <form
              onSubmit={handleSubmit}
              className="mt-4 flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4 shadow-e1"
            >
              <Field label="ชื่อ-นามสกุล">
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
              </Field>
              <Field label="อีเมล">
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </Field>
              <Field label="เบอร์โทร">
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
              </Field>

              {error && <p className="text-sm text-rejected-fg">{error}</p>}

              <div className="mt-1 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
                >
                  {submitting ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            </form>
          </>
        )}

        {!loading && !profile && error && <p className="mt-4 text-sm text-rejected-fg">{error}</p>}
      </div>
    </AppShell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-3">{label}</dt>
      <dd className={`font-medium text-ink-2 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink-2">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full rounded-md border border-hairline-strong px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";
