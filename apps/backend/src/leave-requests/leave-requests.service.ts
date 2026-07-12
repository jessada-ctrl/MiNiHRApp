import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';

interface WorkflowStepSnapshot {
  stepOrder: number;
  label: string;
  approverType: 'specific_employee' | 'direct_manager';
  approverEmployeeId: string;
}

const LUNCH_START_MIN = 12 * 60; // 12:00
const LUNCH_END_MIN = 13 * 60; // 13:00
const WORKDAY_HOURS = 8;
const ATTACHMENT_WINDOW_DAYS = 30;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function daysBetweenISO(a: Date, b: Date): number {
  const ms = 24 * 60 * 60 * 1000;
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / ms);
}

@Injectable()
export class LeaveRequestsService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: PrismaClient) {}

  private computeTotalDays(dto: CreateLeaveRequestDto): { totalDays: number; startDatetime: Date; endDatetime: Date } {
    const start = new Date(`${dto.startDate}T00:00:00.000Z`);

    if (dto.durationType === 'full_day') {
      const end = new Date(`${dto.endDate ?? dto.startDate}T00:00:00.000Z`);
      const days = daysBetweenISO(start, end) + 1;
      if (days <= 0) throw new BadRequestException('endDate must be on or after startDate');
      return { totalDays: days, startDatetime: start, endDatetime: end };
    }

    if (dto.durationType === 'half_am' || dto.durationType === 'half_pm') {
      return { totalDays: 0.5, startDatetime: start, endDatetime: start };
    }

    // hourly
    if (!dto.startTime || !dto.endTime) {
      throw new BadRequestException('startTime and endTime are required for hourly leave');
    }
    const startMin = toMinutes(dto.startTime);
    const endMin = toMinutes(dto.endTime);
    if (endMin <= startMin) throw new BadRequestException('endTime must be after startTime');

    const overlap = Math.max(0, Math.min(endMin, LUNCH_END_MIN) - Math.max(startMin, LUNCH_START_MIN));
    const minutes = endMin - startMin - overlap;
    const hours = minutes / 60;
    const totalDays = Math.round((hours / WORKDAY_HOURS) * 100) / 100;
    if (totalDays <= 0) throw new BadRequestException('Requested duration resolves to zero after lunch deduction');

    return { totalDays, startDatetime: start, endDatetime: start };
  }

  /** Every employee can see their own quota summary — not just tenant_admin (that endpoint edits company policy, this just reads your own numbers). */
  async myQuotaSummary(employeeId: string, year = new Date().getFullYear()) {
    const leaveTypes = await this.prisma.leaveType.findMany({ orderBy: { name: 'asc' } });
    return Promise.all(
      leaveTypes.map(async (lt) => ({
        leaveTypeId: lt.id,
        name: lt.name,
        allowHourly: lt.allowHourly,
        requiresAttachmentAfterDays: lt.requiresAttachmentAfterDays,
        ...(await this.getQuotaInfo(employeeId, lt.id, year)),
      })),
    );
  }

  private async getQuotaInfo(employeeId: string, leaveTypeId: string, year: number) {
    const quota = await this.prisma.leaveQuota.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    });
    const total = quota ? quota.totalDays.toNumber() : 0;

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

    const [approvedAgg, pendingAgg] = await Promise.all([
      this.prisma.leaveRequest.aggregate({
        where: { employeeId, leaveTypeId, status: 'approved', startDatetime: { gte: yearStart, lt: yearEnd } },
        _sum: { totalDays: true },
      }),
      this.prisma.leaveRequest.aggregate({
        where: { employeeId, leaveTypeId, status: 'pending', startDatetime: { gte: yearStart, lt: yearEnd } },
        _sum: { totalDays: true },
      }),
    ]);

    const used = approvedAgg._sum.totalDays?.toNumber() ?? 0;
    const pending = pendingAgg._sum.totalDays?.toNumber() ?? 0;
    return { total, used, pending, remaining: total - used - pending };
  }

  /** 30-day backward-looking cumulative, per the resolved FR-2.2 rule — includes this new request. */
  private async getCumulativeAttachmentDays(employeeId: string, leaveTypeId: string, newStart: Date, newDays: number) {
    const windowStart = new Date(newStart);
    windowStart.setDate(windowStart.getDate() - ATTACHMENT_WINDOW_DAYS);

    const existing = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        leaveTypeId,
        status: { in: ['approved', 'pending'] },
        startDatetime: { gte: windowStart, lte: newStart },
      },
      select: { totalDays: true },
    });

    const existingSum = existing.reduce((sum, r) => sum + r.totalDays.toNumber(), 0);
    return existingSum + newDays;
  }

  private async resolveWorkflowSnapshot(employeeId: string, leaveTypeId: string): Promise<WorkflowStepSnapshot[]> {
    const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });

    const workflow =
      (await this.prisma.approvalWorkflow.findFirst({
        where: { scopeType: 'leave_type', scopeId: leaveTypeId },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      })) ??
      (employee.departmentId
        ? await this.prisma.approvalWorkflow.findFirst({
            where: { scopeType: 'department', scopeId: employee.departmentId },
            include: { steps: { orderBy: { stepOrder: 'asc' } } },
          })
        : null) ??
      (employee.branchId
        ? await this.prisma.approvalWorkflow.findFirst({
            where: { scopeType: 'branch', scopeId: employee.branchId },
            include: { steps: { orderBy: { stepOrder: 'asc' } } },
          })
        : null) ??
      (await this.prisma.approvalWorkflow.findFirst({
        where: { scopeType: 'global' },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      }));

    if (!workflow || workflow.steps.length === 0) {
      throw new BadRequestException('No approval workflow is configured for this leave type/department/branch yet — ask HR to set one up first.');
    }

    const snapshot: WorkflowStepSnapshot[] = [];
    for (const step of workflow.steps) {
      let approverEmployeeId: string | null;
      let label: string;
      if (step.approverType === 'direct_manager') {
        approverEmployeeId = employee.directManagerId;
        label = 'หัวหน้างานตรง (Direct Manager)';
      } else {
        approverEmployeeId = step.approverEmployeeId;
        label = 'ผู้อนุมัติที่ระบุ';
      }
      if (!approverEmployeeId) {
        throw new BadRequestException(
          step.approverType === 'direct_manager'
            ? 'You have no direct manager assigned — HR needs to set one before you can submit this leave type.'
            : 'A step in the approval workflow has no approver configured — ask HR to fix the workflow.',
        );
      }
      snapshot.push({ stepOrder: step.stepOrder, label, approverType: step.approverType as 'specific_employee' | 'direct_manager', approverEmployeeId });
    }
    return snapshot;
  }

  async create(employeeId: string, dto: CreateLeaveRequestDto) {
    const tenantId = getCurrentTenantId();
    const leaveType = await this.prisma.leaveType.findUnique({ where: { id: dto.leaveTypeId } });
    if (!leaveType) throw new NotFoundException('Leave type not found');
    if (dto.durationType === 'hourly' && !leaveType.allowHourly) {
      throw new BadRequestException('This leave type does not allow hourly requests');
    }

    const { totalDays, startDatetime, endDatetime } = this.computeTotalDays(dto);
    const year = startDatetime.getFullYear();

    const quota = await this.getQuotaInfo(employeeId, dto.leaveTypeId, year);
    const isOverQuota = totalDays > quota.remaining;
    if (isOverQuota && !dto.lwopAcknowledged) {
      throw new BadRequestException(
        `This request (${totalDays} day(s)) exceeds your remaining quota (${quota.remaining} day(s)). Set lwopAcknowledged=true to acknowledge LWOP and submit anyway.`,
      );
    }

    let needsAttachment = false;
    if (leaveType.requiresAttachmentAfterDays != null) {
      const cumulative = await this.getCumulativeAttachmentDays(employeeId, dto.leaveTypeId, startDatetime, totalDays);
      needsAttachment = cumulative >= leaveType.requiresAttachmentAfterDays;
    }
    if (needsAttachment && !dto.attachmentUrl) {
      throw new BadRequestException(
        `This leave type requires a medical certificate once your cumulative days reach ${leaveType.requiresAttachmentAfterDays} within a 30-day window — please attach one.`,
      );
    }

    const workflowSnapshot = await this.resolveWorkflowSnapshot(employeeId, dto.leaveTypeId);

    return this.prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId,
        leaveTypeId: dto.leaveTypeId,
        durationType: dto.durationType,
        startDatetime,
        endDatetime,
        totalDays,
        reason: dto.reason,
        attachmentUrlEnc: dto.attachmentUrl,
        isOverQuota,
        lwopAcknowledged: isOverQuota ? !!dto.lwopAcknowledged : false,
        status: 'pending',
        currentStep: 0,
        workflowSnapshot: workflowSnapshot as unknown as object,
        currentApproverId: workflowSnapshot[0].approverEmployeeId,
      },
      include: { leaveType: { select: { name: true } } },
    });
  }

  listMine(employeeId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { employeeId },
      include: {
        leaveType: { select: { name: true } },
        approvalActions: { orderBy: { actedAt: 'asc' }, include: { approver: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  pendingForApprover(approverId: string) {
    return this.prisma.leaveRequest.findMany({
      where: { currentApproverId: approverId, status: 'pending' },
      include: {
        leaveType: { select: { name: true } },
        employee: { select: { id: true, fullName: true, departmentId: true } },
        approvalActions: { orderBy: { actedAt: 'asc' }, include: { approver: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async cancel(id: string, employeeId: string) {
    const request = await this.prisma.leaveRequest.findUnique({ where: { id }, include: { approvalActions: true } });
    if (!request) throw new NotFoundException('Leave request not found');
    if (request.employeeId !== employeeId) throw new ForbiddenException('This is not your leave request');
    if (request.status !== 'pending' || request.approvalActions.length > 0) {
      throw new BadRequestException('Only a pending request with no approver action yet can be cancelled — contact HR instead');
    }
    return this.prisma.leaveRequest.update({ where: { id }, data: { status: 'cancelled', currentApproverId: null } });
  }

  async approve(id: string, approverId: string) {
    return this.actOnRequest(id, approverId, 'approve');
  }

  async reject(id: string, approverId: string, comment: string) {
    return this.actOnRequest(id, approverId, 'reject', comment);
  }

  private async actOnRequest(id: string, approverId: string, action: 'approve' | 'reject', comment?: string) {
    const tenantId = getCurrentTenantId();

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.leaveRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException('Leave request not found');
      if (request.status !== 'pending') throw new BadRequestException('This request is no longer pending');
      if (request.currentApproverId !== approverId) {
        throw new ForbiddenException('You are not the assigned approver for the current step of this request');
      }

      await tx.leaveApprovalAction.create({
        data: { tenantId, requestId: id, stepOrder: request.currentStep, approverId, action, comment: comment ?? null },
      });

      const snapshot = request.workflowSnapshot as unknown as WorkflowStepSnapshot[];

      if (action === 'reject') {
        // FR-3.2 resolved rule: rejection at ANY step ends the whole request now.
        return tx.leaveRequest.update({ where: { id }, data: { status: 'rejected', currentApproverId: null } });
      }

      const isFinalStep = request.currentStep >= snapshot.length - 1;
      if (isFinalStep) {
        // TODO FR-4.4: once notifications exist, fire the HR over-quota alert
        // here when request.isOverQuota is true — no notification channel
        // built yet (depends on LINE integration / notification_logs writer).
        return tx.leaveRequest.update({ where: { id }, data: { status: 'approved', currentApproverId: null } });
      }

      const nextStep = snapshot[request.currentStep + 1];
      return tx.leaveRequest.update({
        where: { id },
        data: { currentStep: request.currentStep + 1, currentApproverId: nextStep.approverEmployeeId },
      });
    });
  }
}
