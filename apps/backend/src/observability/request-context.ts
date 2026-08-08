import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  /** Subdomain rather than tenant id: it's what an operator reading logs actually recognises. */
  tenant?: string;
}

/**
 * Carries the request id from the middleware that assigns it down to every
 * log line the request produces, without threading it through call
 * signatures. Same mechanism as tenantContext — see tenant/tenant-context.ts.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
