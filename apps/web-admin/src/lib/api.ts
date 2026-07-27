const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Local dev fallback only — real deployments derive the tenant from the
// subdomain the request actually arrived on (see resolveTenantSubdomain
// below and TenantMiddleware on the backend).
const DEV_TENANT_SUBDOMAIN = process.env.NEXT_PUBLIC_TENANT_SUBDOMAIN ?? 'testco';

const TOKEN_KEY = 'lala_token';

const DEV_HOSTNAME_PATTERN = /^(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)$/;

/**
 * Mirrors TenantMiddleware's own resolution order: in production the
 * X-Tenant-Subdomain header is ignored server-side and only the Host header
 * (i.e. the subdomain the browser is actually on) counts, so deriving it
 * from window.location.hostname here keeps this header meaningful for local
 * debugging without ever being the thing production tenant routing relies
 * on. Falls back to NEXT_PUBLIC_TENANT_SUBDOMAIN on localhost/LAN-IP/SSR,
 * where there's no real subdomain to read.
 */
function resolveTenantSubdomain(): string {
  if (typeof window === 'undefined') return DEV_TENANT_SUBDOMAIN;
  const hostname = window.location.hostname;
  if (DEV_HOSTNAME_PATTERN.test(hostname)) return DEV_TENANT_SUBDOMAIN;
  return hostname.split('.')[0];
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Tenant-Subdomain', resolveTenantSubdomain());
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${API_URL}${path}`, { ...options, headers });
}
