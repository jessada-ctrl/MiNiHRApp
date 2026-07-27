"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { getCurrentUser, type AuthUser } from "@/lib/auth";
import { type Employee, listEmployees } from "@/lib/employees";
import { type Branch, type Department, listBranches, listDepartments } from "@/lib/org";
import { type Holiday, listHolidays } from "@/lib/holidays";
import { type ReportRow, fetchLeaveReport } from "@/lib/reports";
import { type LeaveRequest, listPendingForMe } from "@/lib/leaveRequests";

const ROLE_LABEL: Record<AuthUser["role"], string> = {
  tenant_admin: "ฝ่ายบุคคล",
  approver: "หัวหน้างาน",
  employee: "พนักงาน",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
  cancelled: "ยกเลิกแล้ว",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "#d97706",
  approved: "#0f766e",
  rejected: "#dc2626",
  cancelled: "#94a3b8",
};

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [reportRows, setReportRows] = useState<ReportRow[] | null>(null);
  const [pendingForMe, setPendingForMe] = useState<LeaveRequest[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then(async (u) => {
      if (cancelled || !u) return;
      setUser(u);
      try {
        const tasks: Promise<void>[] = [
          listHolidays().then((h) => {
            if (!cancelled) setHolidays(h);
          }),
        ];
        if (u.role === "tenant_admin" || u.role === "approver") {
          tasks.push(
            listEmployees().then((e) => {
              if (!cancelled) setEmployees(e);
            }),
          );
        }
        if (u.role === "tenant_admin") {
          tasks.push(
            listBranches().then((b) => {
              if (!cancelled) setBranches(b);
            }),
          );
          tasks.push(
            listDepartments().then((d) => {
              if (!cancelled) setDepartments(d);
            }),
          );
          tasks.push(
            fetchLeaveReport({}).then((r) => {
              if (!cancelled) setReportRows(r);
            }),
          );
        }
        if (u.role === "approver") {
          tasks.push(
            listPendingForMe().then((p) => {
              if (!cancelled) setPendingForMe(p);
            }),
          );
        }
        await Promise.all(tasks);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) {
    return (
      <AppShell title="แดชบอร์ด">
        <p className="text-sm text-neutral-400">กำลังโหลด...</p>
      </AppShell>
    );
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const upcomingHoliday = holidays
    .filter((h) => new Date(h.holidayDate) >= todayStart)
    .sort((a, b) => new Date(a.holidayDate).getTime() - new Date(b.holidayDate).getTime())[0];

  const activeEmployees = employees.filter((e) => e.status === "active").length;
  const activeBranches = branches.filter((b) => b.isActive).length;
  const activeDepartments = departments.filter((d) => d.isActive).length;

  const statusCounts = { pending: 0, approved: 0, rejected: 0, cancelled: 0 } as Record<string, number>;
  let overQuotaCount = 0;
  const leaveTypeVolume = new Map<string, number>();
  (reportRows ?? []).forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    if (r.isOverQuota) overQuotaCount++;
    leaveTypeVolume.set(r.leaveType.name, (leaveTypeVolume.get(r.leaveType.name) ?? 0) + 1);
  });
  const totalRequests = reportRows?.length ?? 0;
  const topLeaveTypes = [...leaveTypeVolume.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const recentRequests = (reportRows ?? []).slice(0, 6);

  return (
    <AppShell title="แดชบอร์ด">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">ภาพรวม</h1>
          <p className="mt-1 text-sm text-neutral-500">
            สวัสดี <span className="font-medium text-neutral-700">{user.fullName}</span> · {ROLE_LABEL[user.role]}
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {user.role === "employee" && (
          <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center">
            <p className="text-sm text-neutral-600">
              หน้านี้ออกแบบไว้สำหรับฝ่ายบุคคลและหัวหน้างาน — พนักงานทั่วไปกรุณายื่นใบลาและตรวจสอบประวัติผ่านแอป LINE (LIFF)
            </p>
          </div>
        )}

        {(user.role === "tenant_admin" || user.role === "approver") && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard label="พนักงานทั้งหมด" value={loading ? "…" : employees.length} sub={`${activeEmployees} กำลังทำงาน`} accent="teal" href="/employees" />
              {user.role === "tenant_admin" && (
                <>
                  <StatCard label="สาขาที่ใช้งาน" value={loading ? "…" : activeBranches} sub={`จาก ${branches.length} สาขา`} accent="indigo" href="/organization" />
                  <StatCard label="แผนกที่ใช้งาน" value={loading ? "…" : activeDepartments} sub={`จาก ${departments.length} แผนก`} accent="indigo" href="/organization" />
                  <StatCard label="คำขอลารออนุมัติ" value={loading ? "…" : statusCounts.pending} sub={`จาก ${totalRequests} คำขอทั้งหมด`} accent="amber" href="/approvals" />
                  <StatCard label="เกินโควตา (LWOP)" value={loading ? "…" : overQuotaCount} sub="ต้องตรวจสอบก่อนตัดเงินเดือน" accent="red" href="/reports" />
                </>
              )}
              {user.role === "approver" && (
                <StatCard label="รออนุมัติของฉัน" value={loading ? "…" : pendingForMe?.length ?? 0} sub="คำขอที่ถึงคิวคุณ" accent="amber" href="/approvals" />
              )}
            </div>

            {user.role === "tenant_admin" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="สถานะคำขอลา (ทั้งหมด)">
                  {totalRequests === 0 ? (
                    <p className="py-8 text-center text-sm text-neutral-400">ยังไม่มีข้อมูลคำขอลา</p>
                  ) : (
                    <div className="flex items-center gap-6">
                      <Donut counts={statusCounts} total={totalRequests} />
                      <ul className="flex-1 space-y-2">
                        {Object.entries(statusCounts).map(([status, count]) => (
                          <li key={status} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-neutral-600">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
                              {STATUS_LABEL[status]}
                            </span>
                            <span className="tabular-nums font-medium text-neutral-800">{count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>

                <Card title="ประเภทการลาที่ใช้มากที่สุด">
                  {topLeaveTypes.length === 0 ? (
                    <p className="py-8 text-center text-sm text-neutral-400">ยังไม่มีข้อมูลคำขอลา</p>
                  ) : (
                    <ul className="space-y-3">
                      {topLeaveTypes.map(([name, count]) => (
                        <li key={name}>
                          <div className="flex justify-between text-sm text-neutral-600">
                            <span>{name}</span>
                            <span className="tabular-nums font-medium text-neutral-800">{count}</span>
                          </div>
                          <div className="mt-1 h-2 w-full rounded-full bg-neutral-100">
                            <div
                              className="h-2 rounded-full bg-sky-600"
                              style={{ width: `${(count / topLeaveTypes[0][1]) * 100}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              {user.role === "tenant_admin" && (
                <Card title="คำขอล่าสุด" className="lg:col-span-2">
                  {recentRequests.length === 0 ? (
                    <p className="py-8 text-center text-sm text-neutral-400">ยังไม่มีคำขอลา</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <tbody className="divide-y divide-neutral-100">
                          {recentRequests.map((r) => (
                            <tr key={r.id}>
                              <td className="py-2 pr-3 font-medium text-neutral-800">{r.employee.fullName}</td>
                              <td className="py-2 pr-3 text-neutral-500">{r.leaveType.name}</td>
                              <td className="py-2 pr-3 text-neutral-500">
                                {new Date(r.startDatetime).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                              </td>
                              <td className="py-2 text-right">
                                <span
                                  className="rounded px-2 py-0.5 text-xs font-medium"
                                  style={{ backgroundColor: `${STATUS_COLOR[r.status]}1a`, color: STATUS_COLOR[r.status] }}
                                >
                                  {STATUS_LABEL[r.status]}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}

              {user.role === "approver" && (
                <Card title="รออนุมัติของฉัน" className="lg:col-span-2">
                  {!pendingForMe || pendingForMe.length === 0 ? (
                    <p className="py-8 text-center text-sm text-neutral-400">🎉 ไม่มีคำขอค้างพิจารณา</p>
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {pendingForMe.slice(0, 6).map((r) => (
                        <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                          <span className="font-medium text-neutral-800">{r.employee.fullName}</span>
                          <span className="text-neutral-500">{r.leaveType.name}</span>
                          <span className="tabular-nums text-neutral-500">
                            {new Date(r.startDatetime).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link href="/approvals" className="mt-3 inline-block text-sm font-medium text-sky-700 hover:text-sky-900">
                    ดูทั้งหมด →
                  </Link>
                </Card>
              )}

              <Card title="วันหยุดถัดไป">
                {!upcomingHoliday ? (
                  <p className="py-8 text-center text-sm text-neutral-400">ไม่มีวันหยุดที่กำหนดไว้ล่วงหน้า</p>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
                    <p className="text-3xl font-semibold text-sky-700">
                      {new Date(upcomingHoliday.holidayDate).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                    </p>
                    <p className="text-sm text-neutral-600">{upcomingHoliday.name}</p>
                    <p className="text-xs text-neutral-400">
                      แจ้งเตือนล่วงหน้า {upcomingHoliday.notifyDaysBefore} วัน (ผ่าน LINE เมื่อเชื่อมต่อแล้ว)
                    </p>
                  </div>
                )}
                <Link href="/holidays" className="mt-3 inline-block text-sm font-medium text-sky-700 hover:text-sky-900">
                  ดูปฏิทินทั้งหมด →
                </Link>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

const ACCENT_CLASSES: Record<string, string> = {
  teal: "bg-sky-50 text-sky-700",
  indigo: "bg-indigo-50 text-indigo-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
};

function StatCard({
  label,
  value,
  sub,
  accent,
  href,
}: {
  label: string;
  value: string | number;
  sub: string;
  accent: keyof typeof ACCENT_CLASSES;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${ACCENT_CLASSES[accent]}`}>
        {label}
      </span>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-900">{value}</p>
      <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>
    </Link>
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-neutral-200 bg-white p-5 ${className ?? ""}`}>
      <h2 className="text-sm font-semibold text-neutral-800">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Donut({ counts, total }: { counts: Record<string, number>; total: number }) {
  let cursor = 0;
  const stops: string[] = [];
  Object.entries(counts).forEach(([status, count]) => {
    if (count === 0) return;
    const start = (cursor / total) * 360;
    cursor += count;
    const end = (cursor / total) * 360;
    stops.push(`${STATUS_COLOR[status]} ${start}deg ${end}deg`);
  });

  return (
    <div
      className="relative h-28 w-28 shrink-0 rounded-full"
      style={{ background: `conic-gradient(${stops.join(", ")})` }}
    >
      <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-white">
        <span className="text-lg font-semibold tabular-nums text-neutral-900">{total}</span>
        <span className="text-[10px] text-neutral-400">คำขอ</span>
      </div>
    </div>
  );
}
