"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import logoIcon from "@/assets/logo-icon.png";
import { requestLineOtp, verifyLineOtp } from "@/lib/auth";
import { getLineUserId, isLiffConfigured } from "@/lib/liff";

type Step = "identify" | "otp";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("identify");
  // Starts null (= "still checking") rather than false, so the dev-mode
  // warning and the manual LINE-User-ID field don't flash on screen for a
  // properly configured tenant while the config request is in flight.
  const [liffConfigured, setLiffConfigured] = useState<boolean | null>(null);
  const [employeeCode, setEmployeeCode] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [devLineUserId, setDevLineUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void isLiffConfigured().then((configured) => {
      if (active) setLiffConfigured(configured);
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleRequestOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await requestLineOtp(employeeCode.trim(), email.trim());
      setInfo(res.devOtpCode ? `${res.message} (DEV: ${res.devOtpCode})` : res.message);
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งรหัส OTP ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // getLineUserId() may call liff.login(), which navigates away and
      // always lands back on the bare root page (see page.tsx) — this lets
      // that page send the user back here instead of to /login once the
      // LINE session is established, rather than a dead-end extra click.
      sessionStorage.setItem("liff-return-to", "/register");
      const lineUserId = (await getLineUserId()) ?? devLineUserId.trim();
      if (!lineUserId) {
        setError("กรุณากรอก LINE User ID สำหรับทดสอบ");
        setSubmitting(false);
        return;
      }
      await verifyLineOtp(employeeCode.trim(), email.trim(), otpCode.trim(), lineUserId);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ยืนยัน OTP ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-bg px-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Image src={logoIcon} alt="LaLa'" width={48} height={48} className="mx-auto rounded-lg" priority />
          <h1 className="mt-3 text-lg font-semibold text-ink">ผูกบัญชี LINE</h1>
          <p className="text-xs text-ink-3">
            {step === "identify"
              ? "กรอกรหัสพนักงานและอีเมลบริษัท เพื่อรับรหัส OTP ยืนยันตัวตน"
              : "กรอกรหัส OTP 6 หลักที่ส่งไปยังอีเมลของคุณ"}
          </p>
        </div>

        {liffConfigured === false && (
          <p className="mb-3 rounded-lg bg-pending-bg px-3 py-2 text-xs text-pending-fg">
            ⚠️ ยังไม่ได้เชื่อมต่อ LINE จริง (โหมดทดสอบ) — ระบบจริงจะดึง LINE User ID จาก LIFF SDK อัตโนมัติ
          </p>
        )}

        {step === "identify" && (
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-e1">
            <div>
              <label htmlFor="register-employee-code" className="mb-1 block text-sm font-medium text-ink-2">
                รหัสพนักงาน
              </label>
              <input
                id="register-employee-code"
                name="employeeCode"
                required
                autoComplete="username"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                className="w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label htmlFor="register-email" className="mb-1 block text-sm font-medium text-ink-2">
                อีเมลบริษัท
              </label>
              <input
                id="register-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {error && <p className="text-sm text-rejected-fg">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-md bg-brand-500 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
            >
              {submitting ? "กำลังส่งรหัส..." : "ส่งรหัส OTP"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerify} className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-e1">
            {info && <p className="text-xs text-ink-3">{info}</p>}
            <div>
              <label htmlFor="register-otp" className="mb-1 block text-sm font-medium text-ink-2">
                รหัส OTP (6 หลัก)
              </label>
              <input
                id="register-otp"
                name="otpCode"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-md border border-hairline-strong px-3 py-2.5 text-center text-lg tracking-[0.5em] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {liffConfigured === false && (
              <div>
                <label htmlFor="register-dev-line-user-id" className="mb-1 block text-sm font-medium text-ink-2">
                  LINE User ID (สำหรับทดสอบ)
                </label>
                <input
                  id="register-dev-line-user-id"
                  name="devLineUserId"
                  required
                  autoComplete="off"
                  value={devLineUserId}
                  onChange={(e) => setDevLineUserId(e.target.value)}
                  placeholder="เช่น Ux_test_dev_001"
                  className="w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            )}

            {error && <p className="text-sm text-rejected-fg">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-md bg-brand-500 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
            >
              {submitting ? "กำลังยืนยัน..." : "ยืนยันและผูกบัญชี"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("identify");
                setOtpCode("");
                setError(null);
              }}
              className="text-center text-xs text-ink-3 underline"
            >
              กรอกรหัส/อีเมลใหม่
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-ink-3">
          มีบัญชีอยู่แล้ว?{" "}
          <Link href="/login" className="text-brand-ink underline">
            เข้าสู่ระบบด้วยอีเมล (ทดสอบ)
          </Link>
        </p>
      </div>
    </main>
  );
}
