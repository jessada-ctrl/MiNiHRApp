import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { tenantContext } from './tenant-context';

const WEBHOOK_PATH = /^\/v1\/webhook\/line\/([^/]+)/;

/**
 * Resolves the tenant for every incoming request and runs the rest of the
 * request inside tenantContext so PrismaService's tenant-scoping extension
 * can enforce NFR-1 without every handler having to pass tenantId manually.
 *
 * Resolution order:
 *  1. LINE webhook path `/v1/webhook/line/:tenantId` (FR-1.2) — tenantId comes
 *     straight from the URL.
 *  2. `X-Tenant-Subdomain` header — local development / API testing convenience,
 *     since localhost doesn't do real subdomains without extra host-file setup.
 *  3. Subdomain of the Host header — the production path (`{subdomain}.lala.io`).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // req.path (and req.url) get stripped to the segment relative to the
    // middleware's mount point when NestJS binds via forRoutes('*') — only
    // req.originalUrl reliably still has the full, unmodified request path.
    const path = req.originalUrl.split('?')[0];
    const webhookMatch = path.match(WEBHOOK_PATH);

    if (webhookMatch) {
      const tenantId = webhookMatch[1];
      // TODO: before production, verify this tenantId actually exists (a single
      // indexed lookup) so a forged webhook path can't be used to probe / spam
      // processing for nonexistent tenants. Skipped here to keep the local-dev
      // hot path fast; add once the LINE signature verification (NFR-3) lands,
      // since both checks belong in the same guard.
      return tenantContext.run({ tenantId }, () => next());
    }

    // The X-Tenant-Subdomain override is a local-dev/API-testing convenience
    // ONLY — honoring a client-supplied header for tenant resolution in
    // production would let any caller point their request at a different
    // tenant's subdomain context. (JwtStrategy's tenantId cross-check would
    // still catch an authenticated request that tried to pivot tenants this
    // way, but there's no reason to accept the header at all outside dev.)
    const headerOverride = process.env.NODE_ENV === 'production' ? undefined : req.header('x-tenant-subdomain');
    const subdomain = headerOverride ?? req.hostname.split('.')[0];

    if (!subdomain) {
      res.status(400).json({ message: 'Unable to determine tenant subdomain for this request' });
      return;
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { subdomain } });
    if (!tenant) {
      this.logger.warn(`Unknown tenant subdomain: "${subdomain}"`);
      res.status(400).json({ message: `Unknown tenant: "${subdomain}"` });
      return;
    }

    tenantContext.run({ tenantId: tenant.id }, () => next());
  }
}
