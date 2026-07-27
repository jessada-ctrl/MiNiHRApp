const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Deliberately a separate localStorage key from api.ts's TOKEN_KEY
// ('lala_token') — a SaaS Super Admin session and a tenant employee session
// are unrelated tokens (different Passport strategies on the backend, see
// saas-admin-jwt.strategy.ts) and must not collide if both are ever open in
// the same browser.
const SUPER_ADMIN_TOKEN_KEY = "lala_super_admin_token";

export interface SaasAdminProfile {
  id: string;
  email: string;
  name: string;
}

export type SubscriptionStatus = "trial" | "active" | "suspended";

export interface Tenant {
  id: string;
  companyName: string;
  subdomain: string;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
  employeeCount: number;
}

export interface PlatformOverview {
  totalTenants: number;
  totalEmployees: number;
  tenantsByStatus: Record<SubscriptionStatus, number>;
}

function getSuperAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SUPER_ADMIN_TOKEN_KEY);
}

function setSuperAdminToken(token: string): void {
  localStorage.setItem(SUPER_ADMIN_TOKEN_KEY, token);
}

export function superAdminLogout(): void {
  localStorage.removeItem(SUPER_ADMIN_TOKEN_KEY);
}

async function superAdminFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = getSuperAdminToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${API_URL}${path}`, { ...options, headers });
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function superAdminLogin(email: string, password: string): Promise<SaasAdminProfile> {
  const res = await superAdminFetch("/saas-admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? "เข้าสู่ระบบไม่สำเร็จ");
  }
  const data: { accessToken: string; admin: SaasAdminProfile } = await res.json();
  setSuperAdminToken(data.accessToken);
  return data.admin;
}

export async function getCurrentSuperAdmin(): Promise<SaasAdminProfile | null> {
  const res = await superAdminFetch("/saas-admin/auth/me");
  if (!res.ok) {
    superAdminLogout();
    return null;
  }
  return res.json();
}

export async function listTenants(): Promise<Tenant[]> {
  return unwrap(await superAdminFetch("/saas-admin/tenants"));
}

export async function createTenant(input: { companyName: string; subdomain: string }): Promise<Tenant> {
  return unwrap(await superAdminFetch("/saas-admin/tenants", { method: "POST", body: JSON.stringify(input) }));
}

export async function updateTenantStatus(tenantId: string, subscriptionStatus: SubscriptionStatus): Promise<Tenant> {
  return unwrap(
    await superAdminFetch(`/saas-admin/tenants/${tenantId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ subscriptionStatus }),
    }),
  );
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  return unwrap(await superAdminFetch("/saas-admin/overview"));
}
