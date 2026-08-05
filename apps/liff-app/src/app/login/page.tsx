"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { login } from "@/lib/auth";
import logoIcon from "@/assets/logo-icon.png";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-bg px-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Image src={logoIcon} alt="LaLa'" width={48} height={48} className="mx-auto rounded-lg" priority />
          <h1 className="mt-3 text-lg font-semibold text-ink">LaLa&apos;</h1>
          <p className="text-xs text-ink-3">
            ต้นแบบสำหรับทดสอบ — ระบบจริงจะเข้าผ่าน LINE (LIFF) ไม่ต้อง Login แบบนี้
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-e1">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-2">อีเมล</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-2">รหัสผ่าน</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-md bg-brand-500 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-ink-3">
          ยังไม่ได้ผูกบัญชี LINE?{" "}
          <Link href="/register" className="text-brand-600 underline">
            ผูกบัญชีด้วย OTP
          </Link>
        </p>
      </div>
    </main>
  );
}
