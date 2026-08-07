"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { forgotPassword } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      setSent(await forgotPassword(email.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ขอลิงก์ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-hairline bg-surface p-8 shadow-e1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">ลืมรหัสผ่าน</h1>
        <p className="mt-1 text-sm text-ink-3">กรอกอีเมลบริษัทของคุณ เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้</p>

        {sent ? (
          // The confirmation is deliberately the same whether or not the
          // address matched an account — showing "no such user" here would
          // turn this form into a way to enumerate who works at the company.
          <>
            <p className="mt-6 rounded-md bg-approved-bg px-3 py-3 text-sm text-approved-fg">{sent}</p>
            <p className="mt-3 text-xs text-ink-3">
              ไม่ได้รับอีเมล? ลองตรวจในกล่องจดหมายขยะ หรือติดต่อฝ่ายบุคคลให้ตั้งรหัสผ่านชั่วคราวให้
            </p>
            <Link href="/login" className="mt-6 block text-center text-sm font-medium text-brand-ink underline hover:no-underline">
              กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="forgot-email" className="block text-sm font-medium text-ink-2">
                อีเมล
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-hairline-strong px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            {error && <p className="text-sm text-rejected-fg">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full rounded-md bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
            >
              {submitting ? "กำลังส่ง..." : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}
            </button>

            <Link href="/login" className="text-center text-sm text-ink-3 underline hover:text-ink-2">
              กลับไปหน้าเข้าสู่ระบบ
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
