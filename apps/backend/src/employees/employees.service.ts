import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

interface ActorContext {
  userId: string;
  ipAddress: string;
}

@Injectable()
export class EmployeesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.employee.findMany({
      omit: { passwordHash: true },
      include: { department: true, branch: true, directManager: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateEmployeeDto) {
    const tenantId = getCurrentTenantId();
    const year = new Date().getFullYear();

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        omit: { passwordHash: true },
        data: {
          // The tenant-scoping extension injects this too at runtime, but the
          // static Prisma types don't know that — pass it explicitly so this
          // still type-checks (and stays correct if the extension is ever
          // bypassed for some reason).
          tenantId,
          employeeCode: dto.employeeCode,
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
          departmentId: dto.departmentId,
          branchId: dto.branchId,
          position: dto.position,
          role: dto.role ?? 'employee',
          status: 'active',
        },
      });

      // FR-4.8: new employees start with each leave type's current default
      // quota for this year.
      const leaveTypes = await tx.leaveType.findMany({ select: { id: true, defaultQuota: true } });
      if (leaveTypes.length > 0) {
        await tx.leaveQuota.createMany({
          data: leaveTypes.map((t) => ({
            tenantId,
            employeeId: employee.id,
            leaveTypeId: t.id,
            year,
            totalDays: t.defaultQuota,
          })),
          skipDuplicates: true,
        });
      }

      return employee;
    });
  }

  async update(id: string, dto: UpdateEmployeeDto, actor: ActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.employee.findUnique({ where: { id }, omit: { passwordHash: true } });
      if (!before) throw new NotFoundException('Employee not found');

      const data: Record<string, unknown> = {};
      const changes: string[] = [];

      // Non-sensitive fields — updated freely, never audited.
      if (dto.fullName !== undefined && dto.fullName !== before.fullName) data.fullName = dto.fullName;
      if (dto.email !== undefined && dto.email !== before.email) data.email = dto.email;
      if (dto.phone !== undefined && dto.phone !== before.phone) data.phone = dto.phone;
      if (dto.departmentId !== undefined && dto.departmentId !== before.departmentId) data.departmentId = dto.departmentId;
      if (dto.branchId !== undefined && dto.branchId !== before.branchId) data.branchId = dto.branchId;
      if (dto.position !== undefined && dto.position !== before.position) data.position = dto.position;

      // Sensitive fields (FR-4.6 Audit Log Scope) — role, direct manager,
      // active/inactive status. Every real change here is audited.
      if (dto.role !== undefined && dto.role !== before.role) {
        data.role = dto.role;
        changes.push(`role: ${before.role} → ${dto.role}`);
      }
      if (dto.directManagerId !== undefined && dto.directManagerId !== before.directManagerId) {
        data.directManagerId = dto.directManagerId;
        changes.push(`direct manager changed`);
      }
      if (dto.status !== undefined && dto.status !== before.status) {
        data.status = dto.status;
        changes.push(`status: ${before.status} → ${dto.status}`);
      }

      if (Object.keys(data).length === 0) {
        // No-op save — do not write a spurious audit entry (FR-4.6).
        return before;
      }

      const updated = await tx.employee.update({ where: { id }, data, omit: { passwordHash: true } });

      if (changes.length > 0) {
        await this.audit.record(tx, {
          userId: actor.userId,
          action: `employee.update — ${changes.join('; ')}`,
          targetTable: 'employees',
          targetId: id,
          ipAddress: actor.ipAddress,
        });
      }

      return updated;
    });
  }

  async getQuotas(employeeId: string, year = new Date().getFullYear()) {
    return this.prisma.leaveQuota.findMany({
      where: { employeeId, year },
      include: { leaveType: { select: { id: true, name: true } } },
      orderBy: { leaveType: { name: 'asc' } },
    });
  }

  /**
   * Per-employee quota override (FR-4.8) — does not touch the leave type's
   * company-wide default. Every real change is audited.
   */
  async updateQuotas(
    employeeId: string,
    quotas: { leaveTypeId: string; totalDays: number }[],
    actor: ActorContext,
    year = new Date().getFullYear(),
  ) {
    const tenantId = getCurrentTenantId();

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { id: employeeId }, select: { fullName: true } });
      if (!employee) throw new NotFoundException('Employee not found');

      const changes: string[] = [];

      for (const q of quotas) {
        const before = await tx.leaveQuota.findUnique({
          where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: q.leaveTypeId, year } },
          include: { leaveType: { select: { name: true } } },
        });

        if (before && before.totalDays.toNumber() === q.totalDays) continue; // no-op, skip

        await tx.leaveQuota.upsert({
          where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: q.leaveTypeId, year } },
          update: { totalDays: q.totalDays },
          create: { tenantId, employeeId, leaveTypeId: q.leaveTypeId, year, totalDays: q.totalDays },
        });

        const label = before?.leaveType.name ?? q.leaveTypeId;
        const fromVal = before ? before.totalDays.toNumber() : '(none)';
        changes.push(`${label}: ${fromVal} → ${q.totalDays}`);
      }

      if (changes.length > 0) {
        await this.audit.record(tx, {
          userId: actor.userId,
          action: `employee.quota-override — ${employee.fullName}: ${changes.join('; ')}`,
          targetTable: 'leave_quotas',
          targetId: employeeId,
          ipAddress: actor.ipAddress,
        });
      }

      // Read back via `tx`, not `this.prisma` — the update above hasn't
      // committed yet, so a query on a different connection would see stale
      // (pre-update) rows under READ COMMITTED isolation.
      return tx.leaveQuota.findMany({
        where: { employeeId, year },
        include: { leaveType: { select: { id: true, name: true } } },
        orderBy: { leaveType: { name: 'asc' } },
      });
    });
  }
}
