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
    return this.prisma.employee.create({
      omit: { passwordHash: true },
      data: {
        // The tenant-scoping extension injects this too at runtime, but the
        // static Prisma types don't know that — pass it explicitly so this
        // still type-checks (and stays correct if the extension is ever
        // bypassed for some reason).
        tenantId: getCurrentTenantId(),
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
}
