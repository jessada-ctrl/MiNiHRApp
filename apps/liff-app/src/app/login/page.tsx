"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, MessageCircle } from "lucide-react";
import { login } from "@/lib/auth";
import logoIcon from "@/assets/logo-icon.png";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-ink-2">
              อีเมล
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-ink-2">
              รหัสผ่าน
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-hairline-strong py-2.5 pl-3 pr-11 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-ink-3 hover:text-ink-2"
              >
                {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              </button>
            </div>
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

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-hairline" />
          <span className="text-xs text-ink-3">หรือ</span>
          <span className="h-px flex-1 bg-hairline" />
        </div>

        <Link
          href="/register"
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#06C755] py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#05B34C]"
        >
          <MessageCircle size={18} aria-hidden />
          ผูกบัญชี LINE ด้วย OTP
        </Link>
        <p className="mt-2 text-center text-xs text-ink-3">
          ยังไม่ได้ผูกบัญชี LINE? เริ่มที่นี่เพื่อใช้งานผ่าน LINE
        </p>
      </div>
    </main>
  );
}
