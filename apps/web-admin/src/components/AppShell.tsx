"use client";

import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getCurrentUser, logout, type AuthUser } from "@/lib/auth";

type Role = AuthUser["role"];

const ROLE_LABEL: Record<Role, string> = {
  tenant_admin: "ฝ่ายบุคคล",
  approver: "หัวหน้างาน",
  employee: "พนักงาน",
};

function Icon(path: string) {
  return function IconComponent(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d={path} />
      </svg>
    );
  };
}

const IconHome = Icon("M4 11.5 12 4l8 7.5M6 9.5V20h12V9.5");
const IconUsers = Icon("M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 20c0-2.2-.9-4.2-2.3-5.6M15 5.2a3 3 0 1 1 2 5.6");
const IconBuilding = Icon("M4 21V6l8-3 8 3v15M4 21h16M9 9h1M9 13h1M14 9h1M14 13h1M9 21v-4h6v4");
const IconTag = Icon("M11 3h5.5L21 7.5V13l-8.5 8.5a1.5 1.5 0 0 1-2.1 0L3 14.1a1.5 1.5 0 0 1 0-2.1L11 3Z M16.2 8.2h.01");
const IconFlow = Icon("M6 4h4v4H6zM14 16h4v4h-4zM8 8v4a2 2 0 0 0 2 2h4M14 8v-.5");
const IconCheck = Icon("M9 12.5 11.2 15 15.5 9M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z");
const IconCalendar = Icon("M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z");
const IconChart = Icon("M4 20V10M11 20V4M18 20v-7M3 20h18");
const IconMenu = Icon("M4 6h16M4 12h16M4 18h16");
const IconPanel = Icon("M4 5h16v14H4zM9 5v14");
const IconLogout = Icon("M15 17v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1M10 12h10m0 0-3-3m3 3-3 3");

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: IconHome, roles: ["tenant_admin", "approver", "employee"] },
  { href: "/employees", label: "พนักงาน", icon: IconUsers, roles: ["tenant_admin", "approver"] },
  { href: "/organization", label: "สาขา/แผนก", icon: IconBuilding, roles: ["tenant_admin", "approver"] },
  { href: "/leave-types", label: "ประเภทการลา", icon: IconTag, roles: ["tenant_admin"] },
  { href: "/workflows", label: "สายอนุมัติ", icon: IconFlow, roles: ["tenant_admin", "approver"] },
  { href: "/approvals", label: "รออนุมัติ", icon: IconCheck, roles: ["tenant_admin", "approver"] },
  { href: "/holidays", label: "ปฏิทินวันหยุด", icon: IconCalendar, roles: ["tenant_admin", "approver", "employee"] },
  { href: "/reports", label: "รายงาน", icon: IconChart, roles: ["tenant_admin"] },
];

export default function AppShell({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  if (loading || !user) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-neutral-50">
        <p className="text-sm text-neutral-500">กำลังตรวจสอบสิทธิ์...</p>
      </main>
    );
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(user!.role));
  const todayLabel = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  const initials = user.fullName.trim().slice(0, 1) || "?";

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-slate-900 transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-16" : "md:w-60"}`}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-teal-600 text-sm font-bold text-white">M</div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">MiniHR</p>
              <p className="truncate text-[11px] text-slate-400">Leave &amp; Attendance</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {visibleNav.map((item) => {
            const active = pathname === item.href;
            const ItemIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-teal-600/20 text-teal-300" : "text-slate-300 hover:bg-white/5 hover:text-white"
                } ${collapsed ? "justify-center" : ""}`}
              >
                <ItemIcon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className={`flex items-center gap-2 rounded-md px-1 py-1 ${collapsed ? "justify-center" : ""}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-white">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
                <p className="truncate text-[11px] text-slate-400">{ROLE_LABEL[user.role]}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              title="ออกจากระบบ"
              className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <IconLogout className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 md:hidden"
              aria-label="เปิดเมนู"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="hidden rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 md:inline-flex"
              aria-label="ย่อ/ขยายเมนู"
            >
              <IconPanel className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-neutral-800">{title}</span>
          </div>
          <div className="flex items-center gap-3">
            {actions}
            <span className="hidden items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1 text-xs text-neutral-500 sm:flex">
              <IconCalendar className="h-3.5 w-3.5" />
              {todayLabel}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
