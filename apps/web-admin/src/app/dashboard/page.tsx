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
  pending: "var(--color-pending)",
  approved: "var(--color-approved)",
  rejected: "var(--color-rejected)",
  cancelled: "var(--color-quiet)",
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
        <p className="text-sm text-ink-3">กำลังโหลด...</p>
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
          <h1 className="text-2xl font-semibold tracking-tight text-ink">ภาพรวม</h1>
          <p className="mt-1 text-sm text-ink-3">
            สวัสดี <span className="font-medium text-ink-2">{user.fullName}</span> · {ROLE_LABEL[user.role]}
          </p>
        </div>

        {error && <p className="text-sm text-rejected-fg">{error}</p>}

        {user.role === "employee" && (
          <div className="rounded-lg border border-hairline bg-surface p-6 text-center shadow-e1">
            <p className="text-sm text-ink-2">
              หน้านี้ออกแบบไว้สำหรับฝ่ายบุคคลและหัวหน้างาน — พนักงานทั่วไปกรุณายื่นใบลาและตรวจสอบประวัติผ่านแอป LINE (LIFF)
            </p>
          </div>
        )}

        {(user.role === "tenant_admin" || user.role === "approver") && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard label="พนักงานทั้งหมด" value={loading ? "…" : employees.length} sub={`${activeEmployees} กำลังทำงาน`} accent="info" href="/employees" />
              {user.role === "tenant_admin" && (
                <>
                  <StatCard label="สาขาที่ใช้งาน" value={loading ? "…" : activeBranches} sub={`จาก ${branches.length} สาขา`} accent="quiet" href="/organization" />
                  <StatCard label="แผนกที่ใช้งาน" value={loading ? "…" : activeDepartments} sub={`จาก ${departments.length} แผนก`} accent="quiet" href="/organization" />
                  <StatCard label="คำขอลารออนุมัติ" value={loading ? "…" : statusCounts.pending} sub={`จาก ${totalRequests} คำขอทั้งหมด`} accent="pending" href="/approvals" />
                  <StatCard label="เกินโควตา (LWOP)" value={loading ? "…" : overQuotaCount} sub="ต้องตรวจสอบก่อนตัดเงินเดือน" accent="risk" href="/reports" />
                </>
              )}
              {user.role === "approver" && (
                <StatCard label="รออนุมัติของฉัน" value={loading ? "…" : pendingForMe?.length ?? 0} sub="คำขอที่ถึงคิวคุณ" accent="pending" href="/approvals" />
              )}
            </div>

            {user.role === "tenant_admin" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="สถานะคำขอลา (ทั้งหมด)">
                  {totalRequests === 0 ? (
                    <p className="py-8 text-center text-sm text-ink-3">ยังไม่มีข้อมูลคำขอลา</p>
                  ) : (
                    <div className="flex items-center gap-6">
                      <Donut counts={statusCounts} total={totalRequests} />
                      <ul className="flex-1 space-y-2">
                        {Object.entries(statusCounts).map(([status, count]) => (
                          <li key={status} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-ink-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
                              {STATUS_LABEL[status]}
                            </span>
                            <span className="tabular-nums font-medium text-ink">{count}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>

                <Card title="ประเภทการลาที่ใช้มากที่สุด">
                  {topLeaveTypes.length === 0 ? (
                    <p className="py-8 text-center text-sm text-ink-3">ยังไม่มีข้อมูลคำขอลา</p>
                  ) : (
                    <ul className="space-y-3">
                      {topLeaveTypes.map(([name, count]) => (
                        <li key={name}>
                          <div className="flex justify-between text-sm text-ink-2">
                            <span>{name}</span>
                            <span className="tabular-nums font-medium text-ink">{count}</span>
                          </div>
                          <div className="mt-1 h-2 w-full rounded-full bg-quiet-bg">
                            <div
                              className="h-2 rounded-full bg-brand-500"
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
                    <p className="py-8 text-center text-sm text-ink-3">ยังไม่มีคำขอลา</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <tbody className="divide-y divide-hairline">
                          {recentRequests.map((r) => (
                            <tr key={r.id}>
                              <td className="py-2 pr-3 font-medium text-ink">{r.employee.fullName}</td>
                              <td className="py-2 pr-3 text-ink-3">{r.leaveType.name}</td>
                              <td className="py-2 pr-3 text-ink-3">
                                {new Date(r.startDatetime).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                              </td>
                              <td className="py-2 text-right">
                                <span
                                  className="rounded px-2 py-0.5 text-xs font-medium"
                                  style={{
                                    backgroundColor: `color-mix(in srgb, ${STATUS_COLOR[r.status]} 16%, transparent)`,
                                    color: STATUS_COLOR[r.status],
                                  }}
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
                    <p className="py-8 text-center text-sm text-ink-3">🎉 ไม่มีคำขอค้างพิจารณา</p>
                  ) : (
                    <ul className="divide-y divide-hairline">
                      {pendingForMe.slice(0, 6).map((r) => (
                        <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                          <span className="font-medium text-ink">{r.employee.fullName}</span>
                          <span className="text-ink-3">{r.leaveType.name}</span>
                          <span className="tabular-nums text-ink-3">
                            {new Date(r.startDatetime).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link href="/approvals" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
                    ดูทั้งหมด →
                  </Link>
                </Card>
              )}

              <Card title="วันหยุดถัดไป">
                {!upcomingHoliday ? (
                  <p className="py-8 text-center text-sm text-ink-3">ไม่มีวันหยุดที่กำหนดไว้ล่วงหน้า</p>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
                    <p className="text-3xl font-semibold text-brand-600">
                      {new Date(upcomingHoliday.holidayDate).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                    </p>
                    <p className="text-sm text-ink-2">{upcomingHoliday.name}</p>
                    <p className="text-xs text-ink-3">
                      แจ้งเตือนล่วงหน้า {upcomingHoliday.notifyDaysBefore} วัน (ผ่าน LINE เมื่อเชื่อมต่อแล้ว)
                    </p>
                  </div>
                )}
                <Link href="/holidays" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
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

// Keyed by intent, not by color name, so a palette swap never has to touch call
// sites. No `brand` entry: brand and info are the same navy now, so a second
// navy chip only differed by being too pale to read as a chip at all.
const ACCENT_CLASSES: Record<string, string> = {
  info: "bg-info-bg text-info-fg",
  quiet: "bg-quiet-bg text-quiet-fg",
  pending: "bg-pending-bg text-pending-fg",
  risk: "bg-risk-bg text-risk-fg",
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
      className="rounded-lg border border-hairline bg-surface p-4 shadow-e1 transition-shadow duration-150 hover:shadow-e2"
    >
      <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${ACCENT_CLASSES[accent]}`}>
        {label}
      </span>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink-3">{sub}</p>
    </Link>
  );
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-hairline bg-surface p-5 shadow-e1 ${className ?? ""}`}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
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
      <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-surface">
        <span className="text-lg font-semibold tabular-nums text-ink">{total}</span>
        <span className="text-[10px] text-ink-3">คำขอ</span>
      </div>
    </div>
  );
}
