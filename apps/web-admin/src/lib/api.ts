// Local dev fallback only — real deployments derive the tenant from the
// subdomain the request actually arrived on (see resolveTenantSubdomain
// below and TenantMiddleware on the backend).
const DEV_TENANT_SUBDOMAIN = process.env.NEXT_PUBLIC_TENANT_SUBDOMAIN ?? 'testco';

const TOKEN_KEY = 'lala_token';

const DEV_HOSTNAME_PATTERN = /^(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)$/;

function isDevHostname(): boolean {
  return typeof window !== 'undefined' && DEV_HOSTNAME_PATTERN.test(window.location.hostname);
}

/**
 * Deliberately NOT a build-time constant.
 *
 * `NEXT_PUBLIC_*` values are inlined by `next build`, so baking a real API
 * host here would pin one built image to one customer's domain — every new
 * tenant would need its own image rebuild, defeating the whole multi-tenant
 * backend. In production this app is served by the backend itself under
 * /admin on the tenant's own host (see apps/backend/src/main.ts), so an
 * empty base means every call goes root-relative to whatever subdomain the
 * browser is already on, and the right tenant is resolved automatically.
 *
 * The env var stays supported for the local split-port setup (and any future
 * deploy that puts the API on a separate domain), and localhost falls back to
 * :3001 so a checkout with no .env.local still works.
 */
function resolveApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return isDevHostname() ? 'http://localhost:3001' : '';
}

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

/**
 * Absolute API origin, for the places that have to *show* a URL rather than
 * call one — chiefly the LINE webhook URL on /settings, which the tenant
 * admin copies into the LINE Developers Console. resolveApiUrl() returns ''
 * in the single-origin production deploy, which is right for fetch() but
 * useless to paste anywhere, so fall back to the origin the browser is on
 * (which is that same host).
 */
export function getApiOrigin(): string {
  const base = resolveApiUrl();
  if (base) return base;
  return typeof window === 'undefined' ? '' : window.location.origin;
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

  return fetch(`${resolveApiUrl()}${path}`, { ...options, headers });
}
