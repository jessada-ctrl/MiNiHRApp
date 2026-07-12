import { apiFetch, clearToken, setToken } from './api';

export interface AuthUser {
  id: string;
  tenantId: string;
  role: 'employee' | 'approver' | 'tenant_admin';
  email: string;
  fullName: string;
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
