import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

interface ActorContext {
  userId: string;
  ipAddress: string;
}

@Injectable()
export class OrgService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  listBranches() {
    return this.prisma.branch.findMany({ orderBy: { branchName: 'asc' } });
  }

  listDepartments() {
    return this.prisma.department.findMany({ orderBy: { departmentName: 'asc' }, include: { branch: { select: { id: true, branchName: true } } } });
  }

  createBranch(dto: CreateBranchDto) {
    const tenantId = getCurrentTenantId();
    return this.prisma.branch.create({
      data: {
        tenantId,
        branchName: dto.branchName,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusMeters: dto.radiusMeters,
      },
    });
  }

  async updateBranch(id: string, dto: UpdateBranchDto, actor: ActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.branch.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Branch not found');

      const data: Record<string, unknown> = {};
      if (dto.branchName !== undefined && dto.branchName !== before.branchName) data.branchName = dto.branchName;
      if (dto.address !== undefined && dto.address !== before.address) data.address = dto.address;
      if (dto.latitude !== undefined && dto.latitude !== before.latitude.toNumber()) data.latitude = dto.latitude;
      if (dto.longitude !== undefined && dto.longitude !== before.longitude.toNumber()) data.longitude = dto.longitude;
      if (dto.radiusMeters !== undefined && dto.radiusMeters !== before.radiusMeters) data.radiusMeters = dto.radiusMeters;

      let activeChanged = false;
      if (dto.isActive !== undefined && dto.isActive !== before.isActive) {
        data.isActive = dto.isActive;
        activeChanged = true;
      }

      if (Object.keys(data).length === 0) return before;

      const updated = await tx.branch.update({ where: { id }, data });

      if (activeChanged) {
        await this.audit.record(tx, {
          userId: actor.userId,
          action: `branch.${dto.isActive ? 'activate' : 'deactivate'} — ${before.branchName}`,
          targetTable: 'branches',
          targetId: id,
          ipAddress: actor.ipAddress,
        });
      }

      return updated;
    });
  }

  async createDepartment(dto: CreateDepartmentDto) {
    const tenantId = getCurrentTenantId();
    if (dto.branchId !== undefined && dto.branchId !== null && dto.branchId !== '') {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId }, select: { id: true } });
      if (!branch) throw new BadRequestException('branchId does not refer to a valid branch in this company');
    }
    return this.prisma.department.create({
      data: { tenantId, departmentName: dto.departmentName, branchId: dto.branchId },
    });
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto, actor: ActorContext) {
    if (dto.branchId !== undefined && dto.branchId !== null && dto.branchId !== '') {
      const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId }, select: { id: true } });
      if (!branch) throw new BadRequestException('branchId does not refer to a valid branch in this company');
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.department.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Department not found');

      const data: Record<string, unknown> = {};
      if (dto.departmentName !== undefined && dto.departmentName !== before.departmentName) data.departmentName = dto.departmentName;
      if (dto.branchId !== undefined && dto.branchId !== before.branchId) data.branchId = dto.branchId;

      let activeChanged = false;
      if (dto.isActive !== undefined && dto.isActive !== before.isActive) {
        data.isActive = dto.isActive;
        activeChanged = true;
      }

      if (Object.keys(data).length === 0) return before;

      const updated = await tx.department.update({ where: { id }, data });

      if (activeChanged) {
        await this.audit.record(tx, {
          userId: actor.userId,
          action: `department.${dto.isActive ? 'activate' : 'deactivate'} — ${before.departmentName}`,
          targetTable: 'departments',
          targetId: id,
          ipAddress: actor.ipAddress,
        });
      }

      return updated;
    });
  }
}
