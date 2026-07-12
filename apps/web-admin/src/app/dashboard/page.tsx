"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout, type AuthUser } from "@/lib/auth";

const ROLE_LABEL: Record<AuthUser["role"], string> = {
  tenant_admin: "ฝ่ายบุคคล",
  approver: "หัวหน้างาน",
  employee: "พนักงาน",
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then((u) => {
      if (cancelled) return;
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (loading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-500">กำลังตรวจสอบสิทธิ์...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold text-teal-800">MiniHR</span>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-neutral-900">{user.fullName}</p>
            <p className="text-xs text-neutral-500">{ROLE_LABEL[user.role]}</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <div className="p-6">
        <h1 className="text-xl font-semibold text-neutral-900">ภาพรวม</h1>
        <p className="mt-1 text-sm text-neutral-500">
          เข้าสู่ระบบสำเร็จในนาม <span className="font-medium text-neutral-700">{user.email}</span>
        </p>

        <div className="mt-6 flex gap-4">
          <Link
            href="/employees"
            className="rounded-lg border border-neutral-200 bg-white px-5 py-4 text-sm font-medium text-neutral-800 shadow-sm hover:border-teal-300 hover:bg-teal-50"
          >
            👥 พนักงาน
          </Link>
          <Link
            href="/leave-types"
            className="rounded-lg border border-neutral-200 bg-white px-5 py-4 text-sm font-medium text-neutral-800 shadow-sm hover:border-teal-300 hover:bg-teal-50"
          >
            🏷️ ประเภทการลา
          </Link>
          <Link
            href="/workflows"
            className="rounded-lg border border-neutral-200 bg-white px-5 py-4 text-sm font-medium text-neutral-800 shadow-sm hover:border-teal-300 hover:bg-teal-50"
          >
            🔀 สายอนุมัติ
          </Link>
          <Link
            href="/approvals"
            className="rounded-lg border border-neutral-200 bg-white px-5 py-4 text-sm font-medium text-neutral-800 shadow-sm hover:border-teal-300 hover:bg-teal-50"
          >
            ✅ รออนุมัติ
          </Link>
          <Link
            href="/holidays"
            className="rounded-lg border border-neutral-200 bg-white px-5 py-4 text-sm font-medium text-neutral-800 shadow-sm hover:border-teal-300 hover:bg-teal-50"
          >
            🗓️ ปฏิทินวันหยุด
          </Link>
          <Link
            href="/reports"
            className="rounded-lg border border-neutral-200 bg-white px-5 py-4 text-sm font-medium text-neutral-800 shadow-sm hover:border-teal-300 hover:bg-teal-50"
          >
            🗂 รายงาน
          </Link>
        </div>
      </div>
    </main>
  );
}
