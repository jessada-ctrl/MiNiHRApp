import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { tenantScopingExtension } from '../tenant/tenant-scoping.extension';

export const TENANT_PRISMA = 'TENANT_PRISMA';

/**
 * Global so every feature module can inject PrismaService (unscoped, for
 * platform-level lookups) or TENANT_PRISMA (tenant-scoped, for everything
 * else) without re-declaring this module everywhere.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: TENANT_PRISMA,
      useFactory: (prisma: PrismaService) => prisma.$extends(tenantScopingExtension),
      inject: [PrismaService],
    },
  ],
  exports: [PrismaService, TENANT_PRISMA],
})
export class PrismaModule {}
