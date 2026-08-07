import { apiFetch, clearToken, setToken } from './api';

export interface AuthUser {
  id: string;
  tenantId: string;
  role: 'employee' | 'approver' | 'tenant_admin';
  email: string;
  fullName: string;
  /** Still on a password HR generated — AppShell routes them to /profile until it clears. */
  mustChangePassword: boolean;
}

async function unwrapError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => null);
  // class-validator returns an array when several rules fail at once.
  const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
  throw new Error(message ?? fallback);
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? 'Login failed — please try again');
  }

  const data: { accessToken: string; user: AuthUser } = await res.json();
  setToken(data.accessToken);
  return data.user;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const res = await apiFetch('/auth/me');
  if (!res.ok) {
    clearToken();
    return null;
  }
  return res.json();
}

export function logout(): void {
  clearToken();
}

/**
 * Changing your own password ends every other session you had open. The
 * server hands back a replacement token for *this* one, which has to be
 * stored — otherwise the next request after a successful change would be
 * rejected and the user bounced to the login screen for succeeding.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<AuthUser> {
  const res = await apiFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) await unwrapError(res, 'เปลี่ยนรหัสผ่านไม่สำเร็จ');

  const data: { accessToken: string; user: AuthUser } = await res.json();
  setToken(data.accessToken);
  return data.user;
}

/**
 * Deliberately returns the same message whether or not the address exists —
 * the server does too, so that this page can't be used to work out which
 * email addresses are real accounts at the company.
 */
export async function forgotPassword(email: string): Promise<string> {
  const res = await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
  if (!res.ok) await unwrapError(res, 'ขอลิงก์ตั้งรหัสผ่านใหม่ไม่สำเร็จ');
  const data: { message: string } = await res.json();
  return data.message;
}

export async function resetPassword(token: string, newPassword: string): Promise<string> {
  const res = await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) });
  if (!res.ok) await unwrapError(res, 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ');
  const data: { message: string } = await res.json();
  return data.message;
}
