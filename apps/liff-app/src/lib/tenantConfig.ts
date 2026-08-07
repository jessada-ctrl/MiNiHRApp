import { apiFetch, unwrap } from "./api";

export interface PublicTenantConfig {
  companyName: string;
  subdomain: string;
  liffId: string | null;
}

/**
 * The tenant's own public config, fetched once per page load from
 * GET /tenant/public-config (which resolves the tenant from the Host header).
 *
 * This replaces NEXT_PUBLIC_LIFF_ID. A LIFF id belongs to the tenant's own
 * LINE Login channel, so it necessarily differs per customer — baking it in
 * at `next build` time meant one image could serve exactly one customer.
 *
 * The in-flight promise is cached rather than the result, so the several
 * callers that race on first paint (the root page's LIFF-callback handler,
 * the silent re-auth path, the login screen) share a single request instead
 * of firing one each. Cleared on failure so a transient network error during
 * LINE's in-app-browser cold start doesn't poison the config for the rest of
 * the session.
 */
let cached: Promise<PublicTenantConfig> | null = null;

export function getTenantConfig(): Promise<PublicTenantConfig> {
  if (!cached) {
    cached = apiFetch("/tenant/public-config")
      .then((res) => unwrap<PublicTenantConfig>(res))
      .catch((error: unknown) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}
