"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { resolveCurrentUser } from "@/lib/auth";
import { getMyProfile, updateMyProfile, type MyProfile } from "@/lib/employees";

const inputCls =
  "w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await resolveCurrentUser();
        if (cancelled) return;
        if (!u) {
          router.replace("/login");
          return;
        }
        const p = await getMyProfile();
        if (cancelled) return;
        setProfile(p);
        setFullName(p.fullName);
        setEmail(p.email);
        setPhone(p.phone ?? "");
        setLoading(false);
      } catch {
        if (!cancelled) setLoadError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // The success toast auto-dismisses. Keyed by `saved` so a second save
  // re-triggers the enter animation instead of leaving a stale banner up.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3500);
    return () => clearTimeout(t);
  }, [saved]);

  async function handleSubmit(e: FormEvent) {
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
      setError(err instanceof Error ? err.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
        <p className="text-sm text-ink-3">{loadError}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white"
        >
          ลองใหม่
        </button>
      </main>
    );
  }

  if (loading || !profile) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-ink-3">กำลังโหลด...</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
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

      <header className="flex items-center gap-3 border-b-2 border-gold-500 bg-sidebar px-4 py-3 text-sidebar-ink">
        <button onClick={() => router.push("/")} aria-label="กลับ" className="text-lg leading-none">
          ←
        </button>
        <p className="text-sm font-semibold">ข้อมูลของฉัน</p>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24">
        <div className="mb-3 rounded-lg bg-surface p-4 shadow-e1">
          <dl className="flex flex-col gap-1.5 text-xs text-ink-3">
            <div className="flex justify-between">
              <dt>รหัสพนักงาน</dt>
              <dd className="font-medium text-ink-2">{profile.employeeCode}</dd>
            </div>
            {profile.position && (
              <div className="flex justify-between">
                <dt>ตำแหน่ง</dt>
                <dd className="font-medium text-ink-2">{profile.position}</dd>
              </div>
            )}
            {profile.department && (
              <div className="flex justify-between">
                <dt>แผนก</dt>
                <dd className="font-medium text-ink-2">{profile.department.departmentName}</dd>
              </div>
            )}
            {profile.branch && (
              <div className="flex justify-between">
                <dt>สาขา</dt>
                <dd className="font-medium text-ink-2">{profile.branch.branchName}</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-[11px] text-ink-3">ข้อมูลข้างต้นแก้ไขเองไม่ได้ — ติดต่อฝ่ายบุคคลหากต้องการเปลี่ยนแปลง</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-e1">
          <div>
            <label htmlFor="profile-full-name" className="mb-1 block text-sm font-medium text-ink-2">
              ชื่อ-นามสกุล
            </label>
            <input
              id="profile-full-name"
              name="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="profile-email" className="mb-1 block text-sm font-medium text-ink-2">
              อีเมล
            </label>
            <input
              id="profile-email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="profile-phone" className="mb-1 block text-sm font-medium text-ink-2">
              เบอร์โทร
            </label>
            <input
              id="profile-phone"
              name="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputCls}
            />
          </div>

          {error && <p className="text-sm text-rejected-fg">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-md bg-brand-500 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
          </button>
        </form>
      </main>
    </div>
  );
}
