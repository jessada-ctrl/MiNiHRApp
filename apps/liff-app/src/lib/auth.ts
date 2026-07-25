import { apiFetch, clearToken, setToken, unwrap } from "./api";

export interface AuthUser {
  id: string;
  tenantId: string;
  role: "employee" | "approver" | "tenant_admin";
  email: string;
  fullName: string;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? "Login failed");
  }
  const data: { accessToken: string; user: AuthUser } = await res.json();
  setToken(data.accessToken);
  return data.user;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const res = await apiFetch("/auth/me");
  if (!res.ok) {
    clearToken();
    return null;
  }
  return unwrap(res);
}

export function logout(): void {
  clearToken();
}

export async function requestLineOtp(
  employeeCode: string,
  email: string,
): Promise<{ message: string; devOtpCode?: string }> {
  const res = await apiFetch("/auth/line/request-otp", {
    method: "POST",
    body: JSON.stringify({ employeeCode, email }),
  });
  return unwrap(res);
}

export async function verifyLineOtp(
  employeeCode: string,
  email: string,
  otpCode: string,
  lineUserId: string,
): Promise<AuthUser> {
  const res = await apiFetch("/auth/line/verify-otp", {
    method: "POST",
    body: JSON.stringify({ employeeCode, email, otpCode, lineUserId }),
  });
  const data: { accessToken: string; user: AuthUser } = await unwrap(res);
  setToken(data.accessToken);
  return data.user;
}
