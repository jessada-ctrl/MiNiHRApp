"use client";

import { useState, type FormEvent } from "react";
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
  const [employeeCode, setEmployeeCode] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [devLineUserId, setDevLineUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    <main className="flex flex-1 flex-col items-center justify-center bg-neutral-100 px-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Image src={logoIcon} alt="LaLa'" width={48} height={48} className="mx-auto rounded-2xl" priority />
          <h1 className="mt-3 text-lg font-semibold text-neutral-900">ผูกบัญชี LINE</h1>
          <p className="text-xs text-neutral-500">
            {step === "identify"
              ? "กรอกรหัสพนักงานและอีเมลบริษัท เพื่อรับรหัส OTP ยืนยันตัวตน"
              : "กรอกรหัส OTP 6 หลักที่ส่งไปยังอีเมลของคุณ"}
          </p>
        </div>

        {!isLiffConfigured() && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠️ ยังไม่ได้เชื่อมต่อ LINE จริง (โหมดทดสอบ) — ระบบจริงจะดึง LINE User ID จาก LIFF SDK อัตโนมัติ
          </p>
        )}

        {step === "identify" && (
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">รหัสพนักงาน</label>
              <input
                required
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">อีเมลบริษัท</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-lg bg-teal-700 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {submitting ? "กำลังส่งรหัส..." : "ส่งรหัส OTP"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerify} className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm">
            {info && <p className="text-xs text-neutral-500">{info}</p>}
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">รหัส OTP (6 หลัก)</label>
              <input
                required
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-center text-lg tracking-[0.5em] focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>

            {!isLiffConfigured() && (
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">LINE User ID (สำหรับทดสอบ)</label>
                <input
                  required
                  value={devLineUserId}
                  onChange={(e) => setDevLineUserId(e.target.value)}
                  placeholder="เช่น Ux_test_dev_001"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                />
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-lg bg-teal-700 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
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
              className="text-center text-xs text-neutral-500 underline"
            >
              กรอกรหัส/อีเมลใหม่
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-neutral-400">
          มีบัญชีอยู่แล้ว?{" "}
          <Link href="/login" className="text-teal-700 underline">
            เข้าสู่ระบบด้วยอีเมล (ทดสอบ)
          </Link>
        </p>
      </div>
    </main>
  );
}
