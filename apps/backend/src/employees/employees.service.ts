import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateSelfDto } from './dto/update-self.dto';
import { parseCsv } from './csv.util';

interface ActorContext {
  userId: string;
  ipAddress: string;
}

const IMPORT_ROLES = new Set(['employee', 'approver', 'tenant_admin']);
const IMPORT_STATUSES = new Set(['active', 'inactive']);

export interface BulkImportRowError {
  row: number;
  employeeCode: string;
  message: string;
}

export interface BulkImportCredential {
  row: number;
  employeeCode: string;
  email: string;
  tempPassword: string;
}

export interface BulkImportResult {
  totalRows: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: BulkImportRowError[];
  credentials: BulkImportCredential[];
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

  getSelf(id: string) {
    return this.prisma.employee.findUnique({
      where: { id },
      omit: { passwordHash: true },
      include: { department: true, branch: true, directManager: { select: { id: true, fullName: true } } },
    });
  }

  /**
   * Self-service profile edit. `id` is always the caller's own JWT subject
   * (never a client-supplied param, unlike `update()`), so there's no IDOR
   * surface here, and JwtStrategy.validate() already re-checked this
   * employee exists and is active on this same request. UpdateSelfDto's
   * fields are all in the "non-sensitive" bucket per FR-4.6 (role, status,
   * directManagerId aren't on the DTO at all), so — same as `update()`'s
   * non-sensitive fields — this never writes an audit entry.
   */
  updateSelf(id: string, dto: UpdateSelfDto) {
    const data: Record<string, unknown> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;

    return this.prisma.employee.update({
      where: { id },
      data,
      omit: { passwordHash: true },
      include: { department: true, branch: true, directManager: { select: { id: true, fullName: true } } },
    });
  }

  /**
   * NFR-1 / same class of bug as BUG-002: a client-supplied id referencing
   * another tenant-scoped model (department, branch, employee-as-manager)
   * must be looked up through the tenant-scoped client before being written
   * as a foreign key — otherwise a cross-tenant or wholly bogus id either
   * gets silently accepted (leak) or crashes as an unhandled FK-violation
   * 500 instead of a clean 400.
   */
  /**
   * There's no email provider wired up yet (otp-mailer.service.ts is a
   * stub) and no self-service reset/change-password flow, so a newly
   * created employee has no way to ever set a password themselves. Instead,
   * every new employee gets a random temp password up front, returned once
   * in the create/import response for the admin to relay out-of-band —
   * otherwise `passwordHash` stays NULL forever and email/password login is
   * permanently broken for that account.
   */
  private generateTempPassword(): string {
    return crypto.randomBytes(9).toString('base64url');
  }

  private async assertInTenant(model: 'department' | 'branch' | 'employee', id: string, label: string) {
    const found =
      model === 'department'
        ? await this.prisma.department.findUnique({ where: { id }, select: { id: true } })
        : model === 'branch'
          ? await this.prisma.branch.findUnique({ where: { id }, select: { id: true } })
          : await this.prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new BadRequestException(`${label} does not refer to a valid record in this company`);
  }

  async create(dto: CreateEmployeeDto) {
    if (dto.departmentId) await this.assertInTenant('department', dto.departmentId, 'departmentId');
    if (dto.branchId) await this.assertInTenant('branch', dto.branchId, 'branchId');

    const tenantId = getCurrentTenantId();
    const year = new Date().getFullYear();
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const employee = await this.prisma.$transaction(async (tx) => {
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
          passwordHash,
          // The employee never chose this password — HR relays it out of
          // band — so make replacing it the first thing they have to do.
          mustChangePassword: true,
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

    return { ...employee, tempPassword };
  }

  async update(id: string, dto: UpdateEmployeeDto, actor: ActorContext) {
    if (dto.departmentId) await this.assertInTenant('department', dto.departmentId, 'departmentId');
    if (dto.branchId) await this.assertInTenant('branch', dto.branchId, 'branchId');
    if (dto.directManagerId) await this.assertInTenant('employee', dto.directManagerId, 'directManagerId');

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

  /**
   * Used by the LINE chatbot (and anywhere else routing an inbound LINE
   * event needs to resolve "who sent this"). `tenantId` is passed explicitly
   * alongside `lineUserId` — matching the convention in line-auth.service.ts —
   * even though TENANT_PRISMA already scopes the query, so this stays
   * correct if that extension is ever bypassed.
   */
  findByLineUserId(lineUserId: string) {
    const tenantId = getCurrentTenantId();
    return this.prisma.employee.findFirst({ where: { tenantId, lineUserId } });
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

    const leaveTypeIds = quotas.map((q) => q.leaveTypeId);
    const foundTypes = await this.prisma.leaveType.findMany({ where: { id: { in: leaveTypeIds } }, select: { id: true } });
    const foundTypeIds = new Set(foundTypes.map((t) => t.id));
    const missingTypes = leaveTypeIds.filter((id) => !foundTypeIds.has(id));
    if (missingTypes.length > 0) {
      throw new BadRequestException(`leaveTypeId does not refer to a valid leave type in this company: ${missingTypes.join(', ')}`);
    }

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

  /**
   * FR-4.2: bulk employee import via CSV. Expected header columns
   * (case-insensitive): employeeCode, fullName, email, phone, department,
   * branch, position, role, status, directManagerEmployeeCode, plus one
   * optional `quota:<leave type name>` column per leave type configured for
   * this company (e.g. `quota:ลาป่วย`) — FR-4.8: a value there overrides that
   * leave type's company default for this employee; an empty/missing cell
   * falls back to the default. Only employeeCode/fullName/email are required.
   *
   * Each row is its own transaction so one bad row doesn't roll back the
   * rest of the file. Existing employees (matched by employeeCode) are
   * updated rather than duplicated. Direct-manager links are resolved in a
   * second pass so a manager can appear later in the same file.
   */
  async bulkImport(csvText: string, actor: ActorContext): Promise<BulkImportResult> {
    const tenantId = getCurrentTenantId();
    const rows = parseCsv(csvText);
    if (rows.length === 0) {
      throw new BadRequestException('CSV file has no data rows');
    }

    const [departments, branches, leaveTypes] = await Promise.all([
      this.prisma.department.findMany({ select: { id: true, departmentName: true } }),
      this.prisma.branch.findMany({ select: { id: true, branchName: true } }),
      this.prisma.leaveType.findMany({ select: { id: true, name: true, defaultQuota: true } }),
    ]);
    const deptByName = new Map(departments.map((d) => [d.departmentName.trim().toLowerCase(), d.id]));
    const branchByName = new Map(branches.map((b) => [b.branchName.trim().toLowerCase(), b.id]));

    const errors: BulkImportRowError[] = [];
    const credentials: BulkImportCredential[] = [];
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const year = new Date().getFullYear();

    // Pass 1: create/update core fields (everything except directManagerId).
    const pendingManagerLinks: { row: number; employeeCode: string; managerCode: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // +1 for 0-index, +1 for the header row
      const r = rows[i];
      const employeeCode = r['employeeCode'] ?? '';
      const fullName = r['fullName'] ?? '';
      const email = r['email'] ?? '';

      try {
        if (!employeeCode) throw new BadRequestException('employeeCode is required');
        if (!fullName) throw new BadRequestException('fullName is required');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('email is missing or invalid');

        let departmentId: string | undefined;
        if (r['department']) {
          const found = deptByName.get(r['department'].trim().toLowerCase());
          if (!found) throw new BadRequestException(`department "${r['department']}" does not exist`);
          departmentId = found;
        }

        let branchId: string | undefined;
        if (r['branch']) {
          const found = branchByName.get(r['branch'].trim().toLowerCase());
          if (!found) throw new BadRequestException(`branch "${r['branch']}" does not exist`);
          branchId = found;
        }

        const role = r['role']?.trim() || undefined;
        if (role && !IMPORT_ROLES.has(role)) throw new BadRequestException(`role "${role}" must be one of employee/approver/tenant_admin`);

        const status = r['status']?.trim() || undefined;
        if (status && !IMPORT_STATUSES.has(status)) throw new BadRequestException(`status "${status}" must be active or inactive`);

        if (r['directManagerEmployeeCode']?.trim()) {
          pendingManagerLinks.push({ row: rowNum, employeeCode, managerCode: r['directManagerEmployeeCode'].trim() });
        }

        const quotaOverrides = new Map<string, number>(); // leaveTypeId -> totalDays
        for (const lt of leaveTypes) {
          const cell = r[`quota:${lt.name}`]?.trim();
          if (!cell) continue;
          const value = Number(cell);
          if (!Number.isFinite(value) || value < 0) {
            throw new BadRequestException(`quota:${lt.name} must be a non-negative number, got "${cell}"`);
          }
          quotaOverrides.set(lt.id, value);
        }

        // Only generated for rows that turn out to create a new employee —
        // existing employees keep their current password on update.
        let tempPassword: string | undefined;

        const outcome = await this.prisma.$transaction(async (tx) => {
          const existing = await tx.employee.findUnique({ where: { tenantId_employeeCode: { tenantId, employeeCode } } });

          if (!existing) {
            tempPassword = this.generateTempPassword();
            const passwordHash = await bcrypt.hash(tempPassword, 10);
            const employee = await tx.employee.create({
              data: {
                tenantId,
                employeeCode,
                fullName,
                email,
                phone: r['phone']?.trim() || undefined,
                departmentId,
                branchId,
                position: r['position']?.trim() || undefined,
                role: (role as 'employee' | 'approver' | 'tenant_admin') ?? 'employee',
                status: (status as 'active' | 'inactive') ?? 'active',
                passwordHash,
                // Same as create(): an imported employee's temp password is
                // not one they picked, so it must not become permanent.
                mustChangePassword: true,
              },
            });

            if (leaveTypes.length > 0) {
              await tx.leaveQuota.createMany({
                data: leaveTypes.map((t) => ({
                  tenantId,
                  employeeId: employee.id,
                  leaveTypeId: t.id,
                  year,
                  totalDays: quotaOverrides.get(t.id) ?? t.defaultQuota,
                })),
                skipDuplicates: true,
              });
            }

            return 'created' as const;
          }

          const data: Record<string, unknown> = {};
          const changes: string[] = [];

          if (fullName !== existing.fullName) data.fullName = fullName;
          if (email !== existing.email) data.email = email;
          if (r['phone']?.trim() && r['phone'].trim() !== existing.phone) data.phone = r['phone'].trim();
          if (departmentId !== undefined && departmentId !== existing.departmentId) data.departmentId = departmentId;
          if (branchId !== undefined && branchId !== existing.branchId) data.branchId = branchId;
          if (r['position']?.trim() && r['position'].trim() !== existing.position) data.position = r['position'].trim();

          if (role && role !== existing.role) {
            data.role = role;
            changes.push(`role: ${existing.role} → ${role}`);
          }
          if (status && status !== existing.status) {
            data.status = status;
            changes.push(`status: ${existing.status} → ${status}`);
          }

          if (quotaOverrides.size > 0) {
            const currentQuotas = await tx.leaveQuota.findMany({
              where: { employeeId: existing.id, year, leaveTypeId: { in: [...quotaOverrides.keys()] } },
            });
            const currentByType = new Map(currentQuotas.map((q) => [q.leaveTypeId, q.totalDays.toNumber()]));

            for (const [leaveTypeId, totalDays] of quotaOverrides) {
              const before = currentByType.get(leaveTypeId);
              if (before === totalDays) continue;

              await tx.leaveQuota.upsert({
                where: { employeeId_leaveTypeId_year: { employeeId: existing.id, leaveTypeId, year } },
                update: { totalDays },
                create: { tenantId, employeeId: existing.id, leaveTypeId, year, totalDays },
              });

              const label = leaveTypes.find((t) => t.id === leaveTypeId)?.name ?? leaveTypeId;
              changes.push(`quota ${label}: ${before ?? '(none)'} → ${totalDays}`);
            }
          }

          if (Object.keys(data).length === 0 && changes.length === 0) return 'unchanged' as const;

          if (Object.keys(data).length > 0) {
            await tx.employee.update({ where: { id: existing.id }, data });
          }

          if (changes.length > 0) {
            await this.audit.record(tx, {
              userId: actor.userId,
              action: `employee.bulk-import — ${employeeCode}: ${changes.join('; ')}`,
              targetTable: 'employees',
              targetId: existing.id,
              ipAddress: actor.ipAddress,
            });
          }

          return 'updated' as const;
        });

        if (outcome === 'created') {
          created++;
          if (tempPassword) credentials.push({ row: rowNum, employeeCode, email, tempPassword });
        } else if (outcome === 'updated') updated++;
        else unchanged++;
      } catch (err) {
        errors.push({
          row: rowNum,
          employeeCode: employeeCode || '(missing)',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Pass 2: resolve direct-manager links now that every row's employee exists.
    if (pendingManagerLinks.length > 0) {
      const allCodes = [...new Set([...pendingManagerLinks.map((l) => l.employeeCode), ...pendingManagerLinks.map((l) => l.managerCode)])];
      const allEmployees = await this.prisma.employee.findMany({
        where: { employeeCode: { in: allCodes } },
        select: { id: true, employeeCode: true, directManagerId: true },
      });
      const byCode = new Map(allEmployees.map((e) => [e.employeeCode, e]));

      for (const link of pendingManagerLinks) {
        const employee = byCode.get(link.employeeCode);
        const manager = byCode.get(link.managerCode);
        if (!employee) continue; // row already failed in pass 1

        if (!manager) {
          errors.push({ row: link.row, employeeCode: link.employeeCode, message: `directManagerEmployeeCode "${link.managerCode}" does not exist` });
          continue;
        }
        if (manager.id === employee.id) {
          errors.push({ row: link.row, employeeCode: link.employeeCode, message: 'directManagerEmployeeCode cannot reference the same employee' });
          continue;
        }
        if (employee.directManagerId === manager.id) continue; // no-op

        await this.prisma.$transaction(async (tx) => {
          await tx.employee.update({ where: { id: employee.id }, data: { directManagerId: manager.id } });
          await this.audit.record(tx, {
            userId: actor.userId,
            action: `employee.bulk-import — ${link.employeeCode}: direct manager changed`,
            targetTable: 'employees',
            targetId: employee.id,
            ipAddress: actor.ipAddress,
          });
        });
      }
    }

    return { totalRows: rows.length, created, updated, unchanged, errors, credentials };
  }
}
