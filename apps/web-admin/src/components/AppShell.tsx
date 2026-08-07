"use client";

import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Users,
  Building2,
  Tag,
  Workflow,
  CheckCheck,
  Calendar,
  BarChart3,
  PieChart,
  Clock,
  Bell,
  ScrollText,
  Settings,
  ChevronRight,
  Menu,
  PanelLeft,
  LogOut,
} from "lucide-react";
import { getCurrentUser, logout, type AuthUser } from "@/lib/auth";
import logoIcon from "@/assets/logo-icon.png";

type Role = AuthUser["role"];

const ROLE_LABEL: Record<Role, string> = {
  tenant_admin: "ฝ่ายบุคคล",
  approver: "หัวหน้างาน",
  employee: "พนักงาน",
};

const IconHome = Home;
const IconUsers = Users;
const IconBuilding = Building2;
const IconTag = Tag;
const IconFlow = Workflow;
const IconCheck = CheckCheck;
const IconCalendar = Calendar;
const IconChart = BarChart3;
const IconGear = Settings;
const IconAudit = ScrollText;
const IconPie = PieChart;
const IconClock = Clock;
const IconBell = Bell;
const IconChevron = ChevronRight;
const IconMenu = Menu;
const IconPanel = PanelLeft;
const IconLogout = LogOut;

interface NavLink {
  kind: "link";
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  roles: Role[];
}

interface NavGroup {
  kind: "group";
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  roles: Role[];
  children: { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[];
}

type NavEntry = NavLink | NavGroup;

const NAV_ITEMS: NavEntry[] = [
  { kind: "link", href: "/dashboard", label: "แดชบอร์ด", icon: IconHome, roles: ["tenant_admin", "approver", "employee"] },
  { kind: "link", href: "/employees", label: "พนักงาน", icon: IconUsers, roles: ["tenant_admin", "approver"] },
  { kind: "link", href: "/organization", label: "สาขา/แผนก", icon: IconBuilding, roles: ["tenant_admin"] },
  { kind: "link", href: "/leave-types", label: "ประเภทการลา", icon: IconTag, roles: ["tenant_admin"] },
  { kind: "link", href: "/workflows", label: "สายอนุมัติ", icon: IconFlow, roles: ["tenant_admin"] },
  { kind: "link", href: "/approvals", label: "รออนุมัติ", icon: IconCheck, roles: ["tenant_admin", "approver"] },
  { kind: "link", href: "/holidays", label: "ปฏิทินวันหยุด", icon: IconCalendar, roles: ["tenant_admin", "approver", "employee"] },
  {
    kind: "group",
    label: "รายงาน",
    icon: IconChart,
    roles: ["tenant_admin"],
    children: [
      { href: "/reports", label: "รายงานคำขอลา", icon: IconChart },
      { href: "/quota-utilization", label: "โควตาการลาแยกแผนก", icon: IconPie },
      { href: "/approval-turnaround", label: "ความล่าช้าสายอนุมัติ", icon: IconClock },
      { href: "/notification-log", label: "บันทึกการแจ้งเตือน LINE", icon: IconBell },
      { href: "/audit-log", label: "บันทึกการตรวจสอบ", icon: IconAudit },
    ],
  },
  { kind: "link", href: "/settings", label: "ตั้งค่า LINE OA", icon: IconGear, roles: ["tenant_admin"] },
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

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
      <main className="flex min-h-screen flex-1 items-center justify-center bg-bg">
        <p className="text-sm text-ink-3">กำลังตรวจสอบสิทธิ์...</p>
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

  function isGroupActive(group: NavGroup): boolean {
    return group.children.some((c) => c.href === pathname);
  }
  function isGroupOpen(group: NavGroup): boolean {
    return openGroups[group.label] ?? isGroupActive(group);
  }
  function toggleGroup(group: NavGroup) {
    setOpenGroups((prev) => ({ ...prev, [group.label]: !isGroupOpen(group) }));
  }

  return (
    <div className="flex min-h-screen bg-bg">
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-sidebar shadow-e3 transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-16" : "md:w-60"}`}
      >
        <div className="flex items-center gap-2.5 border-b border-sidebar-line px-4 py-5">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] shadow-e2" style={{ background: "var(--brand-mark)" }}>
            <Image src={logoIcon} alt="" width={22} height={22} className="shrink-0" priority />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-brand text-base text-sidebar-ink">LaLa&apos;</p>
              <p className="truncate text-[11px] text-sidebar-ink-3">Leave &amp; Attendance</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {visibleNav.map((item) => {
            if (item.kind === "link") {
              const active = pathname === item.href;
              const ItemIcon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
                    active
                      ? "bg-gold-500/15 font-semibold text-gold-300"
                      : "font-medium text-sidebar-ink-2 hover:bg-white/5 hover:text-sidebar-ink"
                  } ${collapsed ? "justify-center" : ""}`}
                >
                  <ItemIcon className="h-4 w-4 shrink-0" strokeWidth={2} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            }

            const GroupIcon = item.icon;
            const groupActive = isGroupActive(item);
            const open = isGroupOpen(item);

            if (collapsed) {
              // No room for a submenu when collapsed — link straight to the first report.
              return (
                <Link
                  key={item.label}
                  href={item.children[0].href}
                  onClick={() => setMobileOpen(false)}
                  title={item.label}
                  className={`flex items-center justify-center rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
                    groupActive
                      ? "bg-gold-500/15 font-semibold text-gold-300"
                      : "font-medium text-sidebar-ink-2 hover:bg-white/5 hover:text-sidebar-ink"
                  }`}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" strokeWidth={2} />
                </Link>
              );
            }

            return (
              <div key={item.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(item)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
                    groupActive
                      ? "font-semibold text-gold-300"
                      : "font-medium text-sidebar-ink-2 hover:bg-white/5 hover:text-sidebar-ink"
                  }`}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" strokeWidth={2} />
                  <span className="flex-1 truncate text-left">{item.label}</span>
                  <IconChevron className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`} />
                </button>
                {open && (
                  <div className="mt-1 space-y-1 border-l border-sidebar-line pl-3">
                    {item.children.map((child) => {
                      const active = pathname === child.href;
                      const ChildIcon = child.icon;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ${
                            active
                              ? "bg-gold-500/15 font-semibold text-gold-300"
                              : "text-sidebar-ink-3 hover:bg-white/5 hover:text-sidebar-ink"
                          }`}
                        >
                          <ChildIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                          <span className="truncate">{child.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-line p-3">
          <div className={`flex items-center gap-2 rounded-md px-1 py-1 ${collapsed ? "justify-center" : ""}`}>
            {/* Solid gold, not the brand-mark gradient: white initials over the
                gradient's gold end fall under 3:1. Navy-on-gold clears 10:1. */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-500 text-xs font-bold text-brand-900">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-sidebar-ink">{user.fullName}</p>
                <p className="truncate text-[11px] text-sidebar-ink-3">{ROLE_LABEL[user.role]}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              title="ออกจากระบบ"
              className="shrink-0 rounded-md p-1.5 text-sidebar-ink-3 transition-colors hover:bg-white/10 hover:text-sidebar-ink"
            >
              <IconLogout className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-hairline bg-surface/90 px-4 py-3 shadow-e1 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-quiet-bg md:hidden"
              aria-label="เปิดเมนู"
            >
              <IconMenu className="h-5 w-5" strokeWidth={2} />
            </button>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="hidden rounded-md p-1.5 text-ink-3 transition-colors hover:bg-quiet-bg md:inline-flex"
              aria-label="ย่อ/ขยายเมนู"
            >
              <IconPanel className="h-5 w-5" strokeWidth={2} />
            </button>
            <span className="text-base font-semibold text-ink">{title}</span>
          </div>
          <div className="flex items-center gap-3">
            {actions}
            <span className="hidden items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-xs text-ink-3 sm:flex">
              <IconCalendar className="h-3.5 w-3.5" strokeWidth={2} />
              {todayLabel}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden bg-bg-elev p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
