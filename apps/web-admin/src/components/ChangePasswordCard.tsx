"use client";

import { useState, type FormEvent } from "react";
import { MIN_PASSWORD_LENGTH, PasswordField } from "@/components/PasswordFields";
import { changePassword } from "@/lib/auth";

/**
 * Used both as an ordinary section of /profile and as the blocking screen an
 * employee on an HR-issued temp password is held at (`forced`). Same form
 * either way — only the framing changes — so there is one implementation of
 * "what a password change does" rather than two that can drift.
 */
export default function ChangePasswordCard({ forced = false, onChanged }: { forced?: boolean; onChanged?: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setError("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4 shadow-e1">
      <div>
        <h2 className="text-sm font-semibold text-ink">{forced ? "ตั้งรหัสผ่านของคุณเอง" : "เปลี่ยนรหัสผ่าน"}</h2>
        <p className="mt-0.5 text-xs text-ink-3">
          {forced
            ? "รหัสผ่านปัจจุบันเป็นรหัสชั่วคราวที่ฝ่ายบุคคลตั้งให้ กรุณาเปลี่ยนเป็นรหัสของคุณเองก่อนเริ่มใช้งาน"
            : "เมื่อเปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นที่ยังเข้าสู่ระบบค้างอยู่จะถูกให้ออกจากระบบทั้งหมด"}
        </p>
      </div>

      <PasswordField
        id="current-password"
        label={forced ? "รหัสผ่านชั่วคราวที่ได้รับ" : "รหัสผ่านปัจจุบัน"}
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
      />
      <PasswordField
        id="new-password"
        label="รหัสผ่านใหม่"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        hint={`อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร และต้องไม่ซ้ำกับรหัสผ่านเดิม`}
      />
      <PasswordField
        id="confirm-password"
        label="ยืนยันรหัสผ่านใหม่"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
      />

      {error && <p className="text-sm text-rejected-fg">{error}</p>}
      {done && <p className="text-sm text-approved-fg">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว</p>}

      <div className="mt-1 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-e1 transition-colors duration-150 hover:bg-brand-600 disabled:opacity-60"
        >
          {submitting ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
        </button>
      </div>
    </form>
  );
}
