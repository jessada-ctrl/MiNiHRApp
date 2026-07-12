import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AuditService } from '../audit/audit.service';
import { QueryLeaveReportDto } from './dto/query-leave-report.dto';

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
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
