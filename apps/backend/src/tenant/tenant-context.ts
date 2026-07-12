import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  tenantId: string;
}

/**
 * Per-request tenant context. Set once by TenantMiddleware before a request
 * reaches any route handler; read by PrismaService's query extension to
 * enforce NFR-1 (every tenant-scoped query filtered by tenant_id).
 */
export const tenantContext = new AsyncLocalStorage<TenantStore>();

export function getCurrentTenantId(): string {
  const store = tenantContext.getStore();
  if (!store) {
    throw new Error(
      'No tenant context available. Did the request bypass TenantMiddleware, or is this code running outside an HTTP request (e.g. a script)?',
    );
  }
  return store.tenantId;
}
