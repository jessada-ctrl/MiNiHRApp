import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';

/**
 * FR-1.1 (Tenant Onboarding) + §2.2 (create/suspend tenants, view overview).
 * Uses the *unscoped* PrismaService, not TENANT_PRISMA — Tenant is platform-
 * level (excluded from tenant-scoping.extension.ts), and these routes run
 * with no tenant context at all (excluded from TenantMiddleware).
 */
@Injectable()
export class SaasAdminTenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        companyName: true,
        subdomain: true,
        subscriptionStatus: true,
        createdAt: true,
        _count: { select: { employees: true } },
      },
    });

    return tenants.map((t) => ({
      id: t.id,
      companyName: t.companyName,
      subdomain: t.subdomain,
      subscriptionStatus: t.subscriptionStatus,
      createdAt: t.createdAt,
      employeeCount: t._count.employees,
    }));
  }

  /** FR-1.1: create a new tenant account, auto-provisioning its subdomain (the LINE OA config itself is FR-1.2 self-service by the tenant's own admin). */
  async createTenant(dto: CreateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({ where: { subdomain: dto.subdomain } });
    if (existing) {
      throw new ConflictException(`Subdomain "${dto.subdomain}" is already taken`);
    }

    return this.prisma.tenant.create({
      data: {
        companyName: dto.companyName,
        subdomain: dto.subdomain,
        subscriptionStatus: 'trial',
      },
    });
  }

  /** §2.2: transition a tenant between trial / active / suspended. */
  async updateTenantStatus(tenantId: string, dto: UpdateTenantStatusDto) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { subscriptionStatus: dto.subscriptionStatus },
    });
  }

  /** §2.2: "view overall usage" — platform-wide tenant/employee counts, broken down by subscription status. */
  async getOverview() {
    const [statusCounts, totalTenants, totalEmployees] = await Promise.all([
      this.prisma.tenant.groupBy({ by: ['subscriptionStatus'], _count: { _all: true } }),
      this.prisma.tenant.count(),
      this.prisma.employee.count(),
    ]);

    const tenantsByStatus: Record<string, number> = { trial: 0, active: 0, suspended: 0 };
    for (const row of statusCounts) {
      tenantsByStatus[row.subscriptionStatus] = row._count._all;
    }

    return { totalTenants, totalEmployees, tenantsByStatus };
  }
}
