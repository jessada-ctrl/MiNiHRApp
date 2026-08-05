import { apiFetch, clearToken, setToken, unwrap } from "./api";
import { getLineIdToken } from "./liff";

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

async function loginWithLineIdToken(idToken: string): Promise<AuthUser> {
  const res = await apiFetch("/auth/line/login", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
  const data: { accessToken: string; user: AuthUser } = await unwrap(res);
  setToken(data.accessToken);
  return data.user;
}

/**
 * `getCurrentUser()`, but recovers from an expired/missing app JWT by
 * silently exchanging a live LIFF ID token for a new one — the fix for the
 * "ต้องล็อกอินใหม่ทุกครั้ง" complaint: an employee who already bound their
 * LINE account (via /register's OTP step) has a live LINE session every
 * time they open the app from a Rich Menu button, so there's no reason to
 * fall back to the manual email/password /login screen just because the
 * 8h JWT lapsed. Only returns null (letting the caller redirect to /login)
 * when neither the app session nor a live LINE session is available.
 */
export async function resolveCurrentUser(): Promise<AuthUser | null> {
  const direct = await getCurrentUser();
  if (direct) return direct;

  try {
    const idToken = await getLineIdToken();
    if (!idToken) return null;
    return await loginWithLineIdToken(idToken);
  } catch {
    return null;
  }
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
