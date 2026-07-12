import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';

@Injectable()
export class LeaveTypesService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: PrismaClient) {}

  list() {
    return this.prisma.leaveType.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateLeaveTypeDto) {
    const tenantId = getCurrentTenantId();
    const year = new Date().getFullYear();

    return this.prisma.$transaction(async (tx) => {
      const leaveType = await tx.leaveType.create({
        data: {
          tenantId,
          name: dto.name,
          defaultQuota: dto.defaultQuota,
          requiresAttachmentAfterDays: dto.requiresAttachmentAfterDays ?? null,
          allowHourly: dto.allowHourly ?? true,
        },
      });

      // FR-4.8: the default quota applies to new employees / new leave
      // types going forward — backfill a quota row for every EXISTING
      // employee now, so the leave-request flow always has one to read.
      const employees = await tx.employee.findMany({ select: { id: true } });
      if (employees.length > 0) {
        await tx.leaveQuota.createMany({
          data: employees.map((e) => ({
            tenantId,
            employeeId: e.id,
            leaveTypeId: leaveType.id,
            year,
            totalDays: leaveType.defaultQuota,
          })),
          skipDuplicates: true,
        });
      }

      return leaveType;
    });
  }

  async update(id: string, dto: UpdateLeaveTypeDto) {
    const existing = await this.prisma.leaveType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Leave type not found');

    // Editing the default here must NOT retroactively change quotas already
    // granted to existing employees (FR-4.8) — it only affects employees /
    // leave types created after this point.
    return this.prisma.leaveType.update({
      where: { id },
      data: {
        name: dto.name,
        defaultQuota: dto.defaultQuota,
        requiresAttachmentAfterDays: dto.requiresAttachmentAfterDays,
        allowHourly: dto.allowHourly,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.leaveType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Leave type not found');

    const inUse = await this.prisma.leaveRequest.count({ where: { leaveTypeId: id } });
    if (inUse > 0) {
      throw new BadRequestException('Cannot delete a leave type that already has leave requests referencing it');
    }

    await this.prisma.leaveType.delete({ where: { id } });
    return { deleted: true };
  }
}
