"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  type PlatformOverview,
  type SaasAdminProfile,
  type SubscriptionStatus,
  type Tenant,
  createTenant,
  getCurrentSuperAdmin,
  getPlatformOverview,
  listTenants,
  superAdminLogout,
  updateTenantStatus,
} from "@/lib/superAdmin";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: "ทดลองใช้",
  active: "ใช้งานจริง",
  suspended: "ระงับใช้งาน",
};

const STATUS_BADGE: Record<SubscriptionStatus, string> = {
  trial: "bg-pending-bg text-pending-fg",
  active: "bg-approved-bg text-approved-fg",
  suspended: "bg-rejected-bg text-rejected-fg",
};

const STATUS_ACCENT: Record<SubscriptionStatus, string> = {
  trial: "text-pending-fg",
  active: "text-approved-fg",
  suspended: "text-rejected-fg",
};

export default function SuperAdminPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<SaasAdminProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    return Promise.all([getPlatformOverview(), listTenants()])
      .then(([o, t]) => {
        setError(null);
        setOverview(o);
        setTenants(t);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCurrentSuperAdmin().then((a) => {
      if (cancelled) return;
      if (!a) {
        router.replace("/super-admin/login");
        return;
      }
      setAdmin(a);
      setCheckingAuth(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (admin) refresh();
  }, [admin, refresh]);

  function handleLogout() {
    superAdminLogout();
    router.replace("/super-admin/login");
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await createTenant({ companyName: companyName.trim(), subdomain: subdomain.trim() });
      setCompanyName("");
      setSubdomain("");
      setShowCreate(false);
      await refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "สร้าง tenant ไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(tenantId: string, status: SubscriptionStatus) {
    setUpdatingId(tenantId);
    setError(null);
    try {
      await updateTenantStatus(tenantId, status);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปเดตสถานะไม่สำเร็จ");
    } finally {
      setUpdatingId(null);
    }
  }

  if (checkingAuth || !admin) {
    return (
      <main className="dark flex min-h-screen items-center justify-center bg-bg">
        <p className="text-sm text-ink-2">กำลังตรวจสอบสิทธิ์...</p>
      </main>
    );
  }

  return (
    <div className="dark min-h-screen bg-bg text-ink">
      <header className="flex items-center justify-between border-b border-sidebar-line px-6 py-4">
        <div>
          <p className="text-sm font-semibold text-ink">LaLa&apos; Platform — SaaS Super Admin</p>
          <p className="text-xs text-ink-2">จัดการ Tenant ทั้งหมดในระบบ</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-2">{admin.name}</span>
          <button
            onClick={handleLogout}
            className="rounded-md border border-sidebar-line px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors duration-150 hover:bg-white/5"
          >
            ออกจากระบบ
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {error && <p className="mb-4 text-sm text-rejected-fg">{error}</p>}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatTile label="Tenant ทั้งหมด" value={loading ? "…" : (overview?.totalTenants ?? 0)} />
          <StatTile label="พนักงานทั้งหมด" value={loading ? "…" : (overview?.totalEmployees ?? 0)} />
          <StatTile label={STATUS_LABEL.trial} value={loading ? "…" : (overview?.tenantsByStatus.trial ?? 0)} accentClass={STATUS_ACCENT.trial} />
          <StatTile label={STATUS_LABEL.active} value={loading ? "…" : (overview?.tenantsByStatus.active ?? 0)} accentClass={STATUS_ACCENT.active} />
          <StatTile label={STATUS_LABEL.suspended} value={loading ? "…" : (overview?.tenantsByStatus.suspended ?? 0)} accentClass={STATUS_ACCENT.suspended} />
        </div>

        <div className="mt-8 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">รายชื่อ Tenant</h2>
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-600"
          >
            {showCreate ? "ยกเลิก" : "+ สร้าง Tenant ใหม่"}
          </button>
        </div>

        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="mt-4 flex flex-col gap-3 rounded-lg border border-sidebar-line bg-surface p-5 sm:flex-row sm:items-end"
          >
            <label className="flex-1">
              <span className="block text-xs font-medium text-ink-2">ชื่อบริษัท</span>
              <input
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 w-full rounded-md border border-sidebar-line bg-surface-2 px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </label>
            <label className="flex-1">
              <span className="block text-xs font-medium text-ink-2">Subdomain (เช่น acme → acme.lala.io)</span>
              <input
                required
                pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                title="ตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
                className="mt-1 w-full rounded-md border border-sidebar-line bg-surface-2 px-3 py-2 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </label>
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "กำลังสร้าง..." : "สร้าง"}
            </button>
            {createError && <p className="text-sm text-rejected-fg sm:basis-full">{createError}</p>}
          </form>
        )}

        <div className="mt-4 overflow-x-auto rounded-lg border border-sidebar-line">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-2">
                <th className="px-4 py-3">บริษัท</th>
                <th className="px-4 py-3">Subdomain</th>
                <th className="px-4 py-3">พนักงาน</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3">สร้างเมื่อ</th>
                <th className="px-4 py-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {!loading && tenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-3">
                    ยังไม่มี tenant ในระบบ
                  </td>
                </tr>
              )}
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-ink">{t.companyName}</td>
                  <td className="px-4 py-3 text-ink-2">{t.subdomain}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-2">{t.employeeCount}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[t.subscriptionStatus]}`}>
                      {STATUS_LABEL[t.subscriptionStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-2">
                    {new Date(t.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {(["trial", "active", "suspended"] as SubscriptionStatus[])
                        .filter((s) => s !== t.subscriptionStatus)
                        .map((s) => (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(t.id, s)}
                            disabled={updatingId === t.id}
                            className="rounded-md border border-sidebar-line px-2 py-1 text-xs text-ink-2 transition-colors duration-150 hover:bg-white/5 disabled:opacity-50"
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function StatTile({ label, value, accentClass }: { label: string; value: string | number; accentClass?: string }) {
  return (
    <div className="rounded-lg border border-sidebar-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-2">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${accentClass ?? "text-ink"}`}>{value}</p>
    </div>
  );
}
