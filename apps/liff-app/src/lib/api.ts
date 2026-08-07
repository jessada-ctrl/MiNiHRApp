// Local dev fallback only — real deployments derive the tenant from the
// subdomain the LIFF Endpoint URL actually resolved to (see
// resolveTenantSubdomain below and TenantMiddleware on the backend).
const DEV_TENANT_SUBDOMAIN = process.env.NEXT_PUBLIC_TENANT_SUBDOMAIN ?? "testco";

const TOKEN_KEY = "lala_token";

const DEV_HOSTNAME_PATTERN = /^(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)$/;

function isDevHostname(): boolean {
  return typeof window !== "undefined" && DEV_HOSTNAME_PATTERN.test(window.location.hostname);
}

/**
 * Deliberately NOT a build-time constant — `NEXT_PUBLIC_*` values are inlined
 * by `next build`, so baking a real API host would pin one built image to one
 * customer's domain. In production the backend serves this app under /liff on
 * the tenant's own host, so an empty base sends every call root-relative to
 * whatever subdomain LINE opened the LIFF app on. See the longer note in
 * apps/web-admin/src/lib/api.ts.
 */
function resolveApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return isDevHostname() ? "http://localhost:3001" : "";
}

/**
 * Each tenant gets its own LIFF Endpoint URL under its own subdomain
 * (`https://{subdomain}.../liff`), so the hostname the LIFF app was opened on
 * IS the tenant — exactly the same signal TenantMiddleware reads from the Host
 * header. Only localhost/LAN-IP (no real subdomain to read) falls back to the
 * dev env var.
 */
export function resolveTenantSubdomain(): string {
  if (typeof window === "undefined") return DEV_TENANT_SUBDOMAIN;
  const hostname = window.location.hostname;
  if (DEV_HOSTNAME_PATTERN.test(hostname)) return DEV_TENANT_SUBDOMAIN;
  return hostname.split(".")[0];
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
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
  headers.set("Content-Type", "application/json");
  headers.set("X-Tenant-Subdomain", resolveTenantSubdomain());
  // Skips ngrok's free-tier browser-warning interstitial when the tunnel is ngrok — harmless no-op for any other host.
  headers.set("ngrok-skip-browser-warning", "true");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${resolveApiUrl()}${path}`, { ...options, headers });
}

export async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}
