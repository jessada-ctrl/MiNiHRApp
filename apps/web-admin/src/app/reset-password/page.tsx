"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MIN_PASSWORD_LENGTH, PasswordField } from "@/components/PasswordFields";
import { resetPassword } from "@/lib/auth";

function ResetPasswordForm() {
  // The token arrives in the emailed link. Read from the query string rather
  // than asked for, so the employee never has to copy a 43-character string
  // out of an email by hand.
  const token = useSearchParams().get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      setDone(await resetPassword(token, newPassword));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตั้งรหัสผ่านใหม่ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">ลิงก์ไม่ถูกต้อง</h1>
        <p className="mt-2 text-sm text-ink-3">
          ลิงก์นี้ไม่มีรหัสยืนยัน กรุณาเปิดจากอีเมลที่ระบบส่งให้โดยตรง หรือขอลิงก์ใหม่อีกครั้ง
        </p>
        <Link href="/forgot-password" className="mt-6 block text-center text-sm font-medium text-brand-ink underline hover:no-underline">
          ขอลิงก์ใหม่
        </Link>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">เรียบร้อย</h1>
        <p className="mt-4 rounded-md bg-approved-bg px-3 py-3 text-sm text-approved-fg">{done}</p>
        <Link
          href="/login"
          className="mt-6 block w-full rounded-md bg-brand-500 py-2.5 text-center text-sm font-semibold text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600"
        >
          เข้าสู่ระบบ
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">ตั้งรหัสผ่านใหม่</h1>
      <p className="mt-1 text-sm text-ink-3">เลือกรหัสผ่านใหม่สำหรับบัญชีของคุณ</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <PasswordField
          id="reset-new-password"
          label="รหัสผ่านใหม่"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          hint={`อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`}
        />
        <PasswordField
          id="reset-confirm-password"
          label="ยืนยันรหัสผ่านใหม่"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
        />

        {error && <p className="text-sm text-rejected-fg">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-md bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
        >
          {submitting ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-lg border border-hairline bg-surface p-8 shadow-e1">
        {/* useSearchParams needs a Suspense boundary or the whole route opts out of static rendering. */}
        <Suspense fallback={<p className="text-sm text-ink-3">กำลังโหลด...</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
