import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Unscoped Prisma client. Only inject this directly for platform-level
 * operations that are NOT tenant-scoped (resolving a Tenant by subdomain in
 * TenantMiddleware, SaasAdmin auth, etc). Everything else should depend on
 * the `TENANT_PRISMA` token from PrismaModule, which enforces tenant_id
 * filtering on every query (NFR-1) — see tenant/tenant-scoping.extension.ts.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
