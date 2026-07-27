import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AuditService } from '../audit/audit.service';
import { QueryApprovalTurnaroundDto } from './dto/query-approval-turnaround.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { QueryLeaveReportDto } from './dto/query-leave-report.dto';
import { QueryNotificationLogDto } from './dto/query-notification-log.dto';
import { QueryQuotaUtilizationDto } from './dto/query-quota-utilization.dto';

// Audit logs and notification logs both grow without bound (unlike leave
// requests, which are naturally bounded per year) — cap each report so a
// narrow filter is always fast, and tell the caller when the cap was hit
// rather than silently returning a partial result that looks complete.
const AUDIT_LOG_ROW_CAP = 1000;
const NOTIFICATION_LOG_ROW_CAP = 1000;
const MS_PER_HOUR = 3_600_000;

@Injectable()
export class ReportsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  private buildWhere(query: QueryLeaveReportDto): Prisma.LeaveRequestWhereInput {
    const where: Prisma.LeaveRequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.leaveTypeId) where.leaveTypeId = query.leaveTypeId;
    if (query.startDate || query.endDate) {
      where.startDatetime = {};
      if (query.startDate) where.startDatetime.gte = new Date(`${query.startDate}T00:00:00.000Z`);
      if (query.endDate) where.startDatetime.lte = new Date(`${query.endDate}T23:59:59.999Z`);
    }
    return where;
  }

  leaveRequestsReport(query: QueryLeaveReportDto) {
    return this.prisma.leaveRequest.findMany({
      where: this.buildWhere(query),
      include: {
        employee: { select: { fullName: true, employeeCode: true, department: { select: { departmentName: true } } } },
        leaveType: { select: { name: true } },
      },
      orderBy: { startDatetime: 'desc' },
    });
  }

  async exportLeaveRequestsCsv(query: QueryLeaveReportDto, actor: { userId: string; ipAddress: string }): Promise<string> {
    const rows = await this.leaveRequestsReport(query);

    const header = ['พนักงาน', 'รหัส', 'แผนก', 'ประเภทการลา', 'วันที่เริ่ม', 'วันที่สิ้นสุด', 'จำนวนวัน', 'สถานะ', 'เกินโควตา'];
    const statusLabel: Record<string, string> = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ', cancelled: 'ยกเลิกแล้ว' };
    const lines = [header, ...rows.map((r) => [
      r.employee.fullName,
      r.employee.employeeCode,
      r.employee.department?.departmentName ?? '',
      r.leaveType.name,
      r.startDatetime.toISOString().slice(0, 10),
      r.endDatetime.toISOString().slice(0, 10),
      r.totalDays.toString(),
      statusLabel[r.status] ?? r.status,
      r.isOverQuota ? 'ใช่' : 'ไม่',
    ])];

    const csv = '﻿' + lines.map((row) => row.map(csvEscape).join(',')).join('\r\n');

    // FR-4.7: every export must be audit-logged. Not wrapped in the same
    // transaction as any data write (there isn't one here — this is a
    // read-only export), so a plain insert is enough; NFR-4's atomicity
    // requirement is about a write and its audit row sharing a transaction,
    // which doesn't apply to a report that changes nothing.
    await this.audit.record(this.prisma as unknown as Parameters<AuditService['record']>[0], {
      userId: actor.userId,
      action: `report.export — leave requests CSV (${rows.length} rows, filters: ${JSON.stringify(query)})`,
      targetTable: 'leave_requests',
      ipAddress: actor.ipAddress,
    });

    return csv;
  }

  private buildAuditLogWhere(query: QueryAuditLogDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.targetTable) where.targetTable = query.targetTable;
    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
    if (query.startDate || query.endDate) {
      where.timestamp = {};
      if (query.startDate) where.timestamp.gte = new Date(`${query.startDate}T00:00:00.000Z`);
      if (query.endDate) where.timestamp.lte = new Date(`${query.endDate}T23:59:59.999Z`);
    }
    return where;
  }

  async auditLogReport(query: QueryAuditLogDto): Promise<{ rows: AuditLogReportRow[]; truncated: boolean }> {
    const rows = await this.prisma.auditLog.findMany({
      where: this.buildAuditLogWhere(query),
      orderBy: { timestamp: 'desc' },
      take: AUDIT_LOG_ROW_CAP + 1,
    });
    const truncated = rows.length > AUDIT_LOG_ROW_CAP;
    if (truncated) rows.length = AUDIT_LOG_ROW_CAP;

    // AuditLog.userId isn't a Prisma relation (an actor may be a deactivated/
    // deleted employee, or a platform-level actor with no Employee row at
    // all), so this is a best-effort batch lookup rather than an `include`.
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const actors = userIds.length
      ? await this.prisma.employee.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a]));

    return {
      rows: rows.map((r) => ({
        ...r,
        actorFullName: actorById.get(r.userId)?.fullName ?? null,
        actorEmail: actorById.get(r.userId)?.email ?? null,
      })),
      truncated,
    };
  }

  async exportAuditLogCsv(query: QueryAuditLogDto, actor: { userId: string; ipAddress: string }): Promise<string> {
    const { rows } = await this.auditLogReport(query);

    const header = ['เวลา', 'ผู้กระทำ', 'อีเมล', 'การกระทำ', 'ตารางที่เกี่ยวข้อง', 'รหัสอ้างอิง', 'IP Address'];
    const lines = [
      header,
      ...rows.map((r) => [
        r.timestamp.toISOString(),
        r.actorFullName ?? r.userId,
        r.actorEmail ?? '',
        r.action,
        r.targetTable,
        r.targetId ?? '',
        r.ipAddress,
      ]),
    ];

    const csv = '﻿' + lines.map((row) => row.map(csvEscape).join(',')).join('\r\n');

    await this.audit.record(this.prisma as unknown as Parameters<AuditService['record']>[0], {
      userId: actor.userId,
      action: `report.export — audit log CSV (${rows.length} rows, filters: ${JSON.stringify(query)})`,
      targetTable: 'audit_logs',
      ipAddress: actor.ipAddress,
    });

    return csv;
  }

  /**
   * Aggregated at (department, leaveType) grain — mirrors the same
   * remaining = total - used - pending convention and UTC year-window as
   * LeaveRequestsService.getQuotaInfo (the per-employee "my quota summary"
   * that already exists), just grouped across a department/branch instead
   * of computed one employee at a time.
   */
  async quotaUtilizationReport(query: QueryQuotaUtilizationDto): Promise<QuotaUtilizationRow[]> {
    const year = query.year ?? new Date().getFullYear();

    const employeeWhere: Prisma.EmployeeWhereInput = { status: 'active' };
    if (query.departmentId) employeeWhere.departmentId = query.departmentId;
    if (query.branchId) employeeWhere.branchId = query.branchId;

    const quotas = await this.prisma.leaveQuota.findMany({
      where: {
        year,
        ...(query.leaveTypeId ? { leaveTypeId: query.leaveTypeId } : {}),
        employee: employeeWhere,
      },
      include: {
        employee: { select: { id: true, departmentId: true, department: { select: { departmentName: true } } } },
        leaveType: { select: { name: true } },
      },
    });
    if (quotas.length === 0) return [];

    const employeeIds = [...new Set(quotas.map((q) => q.employeeId))];
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

    const usage = await this.prisma.leaveRequest.groupBy({
      by: ['employeeId', 'leaveTypeId', 'status'],
      where: {
        employeeId: { in: employeeIds },
        status: { in: ['approved', 'pending'] },
        startDatetime: { gte: yearStart, lt: yearEnd },
      },
      _sum: { totalDays: true },
    });
    const usageByEmployeeAndType = new Map<string, { used: number; pending: number }>();
    for (const u of usage) {
      const key = `${u.employeeId}:${u.leaveTypeId}`;
      const entry = usageByEmployeeAndType.get(key) ?? { used: 0, pending: 0 };
      const days = u._sum.totalDays?.toNumber() ?? 0;
      if (u.status === 'approved') entry.used += days;
      else entry.pending += days;
      usageByEmployeeAndType.set(key, entry);
    }

    interface GroupAccumulator {
      departmentId: string | null;
      departmentName: string;
      leaveTypeId: string;
      leaveTypeName: string;
      employeeIds: Set<string>;
      totalQuota: number;
      used: number;
      pending: number;
    }
    const groups = new Map<string, GroupAccumulator>();
    for (const q of quotas) {
      const departmentId = q.employee.departmentId;
      const groupKey = `${departmentId ?? 'none'}:${q.leaveTypeId}`;
      const usageEntry = usageByEmployeeAndType.get(`${q.employeeId}:${q.leaveTypeId}`) ?? { used: 0, pending: 0 };

      const group = groups.get(groupKey) ?? {
        departmentId,
        departmentName: q.employee.department?.departmentName ?? 'ไม่ระบุแผนก',
        leaveTypeId: q.leaveTypeId,
        leaveTypeName: q.leaveType.name,
        employeeIds: new Set<string>(),
        totalQuota: 0,
        used: 0,
        pending: 0,
      };
      group.employeeIds.add(q.employeeId);
      group.totalQuota += q.totalDays.toNumber();
      group.used += usageEntry.used;
      group.pending += usageEntry.pending;
      groups.set(groupKey, group);
    }

    return [...groups.values()]
      .map((g) => ({
        departmentId: g.departmentId,
        departmentName: g.departmentName,
        leaveTypeId: g.leaveTypeId,
        leaveTypeName: g.leaveTypeName,
        employeeCount: g.employeeIds.size,
        totalQuota: round1(g.totalQuota),
        used: round1(g.used),
        pending: round1(g.pending),
        remaining: round1(g.totalQuota - g.used - g.pending),
        utilizationPct: g.totalQuota > 0 ? round1(((g.used + g.pending) / g.totalQuota) * 100) : 0,
      }))
      .sort(
        (a, b) => a.departmentName.localeCompare(b.departmentName, 'th') || a.leaveTypeName.localeCompare(b.leaveTypeName, 'th'),
      );
  }

  async exportQuotaUtilizationCsv(query: QueryQuotaUtilizationDto, actor: { userId: string; ipAddress: string }): Promise<string> {
    const rows = await this.quotaUtilizationReport(query);

    const header = ['แผนก', 'ประเภทการลา', 'จำนวนพนักงาน', 'โควตารวม', 'ใช้ไปแล้ว', 'รออนุมัติ', 'คงเหลือ', '% ใช้ไป'];
    const lines = [
      header,
      ...rows.map((r) => [
        r.departmentName,
        r.leaveTypeName,
        r.employeeCount.toString(),
        r.totalQuota.toString(),
        r.used.toString(),
        r.pending.toString(),
        r.remaining.toString(),
        `${r.utilizationPct}%`,
      ]),
    ];
    const csv = '﻿' + lines.map((row) => row.map(csvEscape).join(',')).join('\r\n');

    await this.audit.record(this.prisma as unknown as Parameters<AuditService['record']>[0], {
      userId: actor.userId,
      action: `report.export — quota utilization CSV (${rows.length} rows, filters: ${JSON.stringify(query)})`,
      targetTable: 'leave_quotas',
      ipAddress: actor.ipAddress,
    });

    return csv;
  }

  /**
   * "Bottleneck" report: per-approver average/max decision wait time from
   * LeaveApprovalAction history, plus their CURRENT pending backlog (the
   * more actionable signal — who has requests sitting with them right now).
   *
   * There's no "step N started" timestamp anywhere (see LeaveRequest's
   * schema comment on currentApproverId) — wait time for a step is derived
   * as the gap between that step's actedAt and the previous step's actedAt
   * (or LeaveRequest.createdAt for the first step), exactly mirroring how
   * LeaveRequestsService.actOnRequest advances currentStep.
   */
  async approvalTurnaroundReport(query: QueryApprovalTurnaroundDto): Promise<ApproverTurnaroundRow[]> {
    const actedAtWhere: Prisma.DateTimeFilter = {};
    if (query.startDate) actedAtWhere.gte = new Date(`${query.startDate}T00:00:00.000Z`);
    if (query.endDate) actedAtWhere.lte = new Date(`${query.endDate}T23:59:59.999Z`);

    const actions = await this.prisma.leaveApprovalAction.findMany({
      where: Object.keys(actedAtWhere).length ? { actedAt: actedAtWhere } : {},
      include: { request: { select: { createdAt: true } } },
      orderBy: [{ requestId: 'asc' }, { stepOrder: 'asc' }],
    });

    interface ApproverStat {
      count: number;
      approvedCount: number;
      rejectedCount: number;
      totalWaitHours: number;
      maxWaitHours: number;
    }
    const statsByApprover = new Map<string, ApproverStat>();

    let prevRequestId: string | null = null;
    let prevTimestamp: Date | null = null;
    for (const a of actions) {
      if (a.requestId !== prevRequestId) prevTimestamp = a.request.createdAt;
      const started = prevTimestamp ?? a.request.createdAt;
      const waitHours = (a.actedAt.getTime() - started.getTime()) / MS_PER_HOUR;
      prevRequestId = a.requestId;
      prevTimestamp = a.actedAt;

      const stat = statsByApprover.get(a.approverId) ?? { count: 0, approvedCount: 0, rejectedCount: 0, totalWaitHours: 0, maxWaitHours: 0 };
      stat.count += 1;
      if (a.action === 'approve') stat.approvedCount += 1;
      else stat.rejectedCount += 1;
      stat.totalWaitHours += waitHours;
      stat.maxWaitHours = Math.max(stat.maxWaitHours, waitHours);
      statsByApprover.set(a.approverId, stat);
    }

    // Currently-open backlog — always as-of-now, independent of the
    // startDate/endDate filter above (which only scopes historical actions).
    const now = new Date();
    const pendingRequests = await this.prisma.leaveRequest.findMany({
      where: { status: 'pending', currentApproverId: { not: null } },
      select: {
        createdAt: true,
        currentApproverId: true,
        approvalActions: { orderBy: { stepOrder: 'desc' }, take: 1, select: { actedAt: true } },
      },
    });
    const pendingByApprover = new Map<string, { count: number; oldestWaitHours: number }>();
    for (const r of pendingRequests) {
      if (!r.currentApproverId) continue;
      const started = r.approvalActions[0]?.actedAt ?? r.createdAt;
      const waitHours = (now.getTime() - started.getTime()) / MS_PER_HOUR;
      const entry = pendingByApprover.get(r.currentApproverId) ?? { count: 0, oldestWaitHours: 0 };
      entry.count += 1;
      entry.oldestWaitHours = Math.max(entry.oldestWaitHours, waitHours);
      pendingByApprover.set(r.currentApproverId, entry);
    }

    const approverIds = new Set([...statsByApprover.keys(), ...pendingByApprover.keys()]);
    const approvers = approverIds.size
      ? await this.prisma.employee.findMany({ where: { id: { in: [...approverIds] } }, select: { id: true, fullName: true } })
      : [];
    const nameById = new Map(approvers.map((e) => [e.id, e.fullName]));

    return [...approverIds]
      .map((id) => {
        const stat = statsByApprover.get(id);
        const pending = pendingByApprover.get(id);
        return {
          approverId: id,
          fullName: nameById.get(id) ?? 'ไม่ทราบชื่อ (พนักงานอาจถูกลบ)',
          decidedCount: stat?.count ?? 0,
          approvedCount: stat?.approvedCount ?? 0,
          rejectedCount: stat?.rejectedCount ?? 0,
          avgWaitHours: stat && stat.count > 0 ? round1(stat.totalWaitHours / stat.count) : null,
          maxWaitHours: stat ? round1(stat.maxWaitHours) : null,
          pendingCount: pending?.count ?? 0,
          oldestPendingWaitHours: pending ? round1(pending.oldestWaitHours) : null,
        };
      })
      .sort((a, b) => (b.oldestPendingWaitHours ?? -1) - (a.oldestPendingWaitHours ?? -1) || (b.avgWaitHours ?? 0) - (a.avgWaitHours ?? 0));
  }

  async exportApprovalTurnaroundCsv(query: QueryApprovalTurnaroundDto, actor: { userId: string; ipAddress: string }): Promise<string> {
    const rows = await this.approvalTurnaroundReport(query);

    const header = ['ผู้อนุมัติ', 'จำนวนที่ตัดสินใจแล้ว', 'อนุมัติ', 'ปฏิเสธ', 'เวลารอเฉลี่ย (ชม.)', 'เวลารอสูงสุด (ชม.)', 'ค้างอยู่ตอนนี้', 'ค้างนานสุด (ชม.)'];
    const lines = [
      header,
      ...rows.map((r) => [
        r.fullName,
        r.decidedCount.toString(),
        r.approvedCount.toString(),
        r.rejectedCount.toString(),
        r.avgWaitHours?.toString() ?? '',
        r.maxWaitHours?.toString() ?? '',
        r.pendingCount.toString(),
        r.oldestPendingWaitHours?.toString() ?? '',
      ]),
    ];
    const csv = '﻿' + lines.map((row) => row.map(csvEscape).join(',')).join('\r\n');

    await this.audit.record(this.prisma as unknown as Parameters<AuditService['record']>[0], {
      userId: actor.userId,
      action: `report.export — approval turnaround CSV (${rows.length} rows, filters: ${JSON.stringify(query)})`,
      targetTable: 'leave_approval_actions',
      ipAddress: actor.ipAddress,
    });

    return csv;
  }

  private buildNotificationLogWhere(query: QueryNotificationLogDto): Prisma.NotificationLogWhereInput {
    const where: Prisma.NotificationLogWhereInput = {};
    if (query.messageType) where.messageType = query.messageType;
    if (query.status) where.status = query.status;
    if (query.startDate || query.endDate) {
      where.sentAt = {};
      if (query.startDate) where.sentAt.gte = new Date(`${query.startDate}T00:00:00.000Z`);
      if (query.endDate) where.sentAt.lte = new Date(`${query.endDate}T23:59:59.999Z`);
    }
    return where;
  }

  async notificationLogReport(query: QueryNotificationLogDto): Promise<{ rows: NotificationLogReportRow[]; truncated: boolean }> {
    const rows = await this.prisma.notificationLog.findMany({
      where: this.buildNotificationLogWhere(query),
      orderBy: { sentAt: 'desc' },
      take: NOTIFICATION_LOG_ROW_CAP + 1,
    });
    const truncated = rows.length > NOTIFICATION_LOG_ROW_CAP;
    if (truncated) rows.length = NOTIFICATION_LOG_ROW_CAP;

    // recipientLineUserId isn't a Prisma relation (a raw LINE user id column,
    // see NotificationLog's schema comment) — best-effort batch lookup, same
    // pattern as AuditLog.userId above.
    const lineUserIds = [...new Set(rows.map((r) => r.recipientLineUserId))];
    const employees = lineUserIds.length
      ? await this.prisma.employee.findMany({ where: { lineUserId: { in: lineUserIds } }, select: { lineUserId: true, fullName: true } })
      : [];
    const nameByLineUserId = new Map(employees.map((e) => [e.lineUserId as string, e.fullName]));

    return {
      rows: rows.map((r) => ({ ...r, recipientFullName: nameByLineUserId.get(r.recipientLineUserId) ?? null })),
      truncated,
    };
  }

  async exportNotificationLogCsv(query: QueryNotificationLogDto, actor: { userId: string; ipAddress: string }): Promise<string> {
    const { rows } = await this.notificationLogReport(query);

    const header = ['เวลาส่ง', 'ผู้รับ', 'ประเภทข้อความ', 'สถานะ', 'รหัสอ้างอิง'];
    const lines = [
      header,
      ...rows.map((r) => [
        r.sentAt.toISOString(),
        r.recipientFullName ?? r.recipientLineUserId,
        r.messageType,
        r.status,
        r.relatedRequestId ?? '',
      ]),
    ];
    const csv = '﻿' + lines.map((row) => row.map(csvEscape).join(',')).join('\r\n');

    await this.audit.record(this.prisma as unknown as Parameters<AuditService['record']>[0], {
      userId: actor.userId,
      action: `report.export — notification log CSV (${rows.length} rows, filters: ${JSON.stringify(query)})`,
      targetTable: 'notification_logs',
      ipAddress: actor.ipAddress,
    });

    return csv;
  }
}

export interface AuditLogReportRow {
  id: string;
  tenantId: string | null;
  userId: string;
  action: string;
  targetTable: string;
  targetId: string | null;
  ipAddress: string;
  timestamp: Date;
  actorFullName: string | null;
  actorEmail: string | null;
}

export interface QuotaUtilizationRow {
  departmentId: string | null;
  departmentName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  employeeCount: number;
  totalQuota: number;
  used: number;
  pending: number;
  remaining: number;
  utilizationPct: number;
}

export interface ApproverTurnaroundRow {
  approverId: string;
  fullName: string;
  decidedCount: number;
  approvedCount: number;
  rejectedCount: number;
  avgWaitHours: number | null;
  maxWaitHours: number | null;
  pendingCount: number;
  oldestPendingWaitHours: number | null;
}

export interface NotificationLogReportRow {
  id: string;
  tenantId: string;
  recipientLineUserId: string;
  messageType: string;
  relatedRequestId: string | null;
  sentAt: Date;
  status: string;
  recipientFullName: string | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
