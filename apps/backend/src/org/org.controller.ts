import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TENANT_PRISMA } from '../prisma/prisma.module';

/**
 * Read-only org-structure lookups (dropdown data for the Employees form).
 * Branch/department CRUD itself belongs to FR-4.5 (attendance locations) —
 * not built yet, so these are seeded fixtures for now.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tenant_admin', 'approver')
export class OrgController {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: PrismaClient) {}

  @Get('branches')
  branches() {
    return this.prisma.branch.findMany({ orderBy: { branchName: 'asc' } });
  }

  @Get('departments')
  departments() {
    return this.prisma.department.findMany({ orderBy: { departmentName: 'asc' } });
  }
}
