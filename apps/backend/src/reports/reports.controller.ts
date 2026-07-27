import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { ReportsService } from './reports.service';
import { QueryApprovalTurnaroundDto } from './dto/query-approval-turnaround.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';
import { QueryLeaveReportDto } from './dto/query-leave-report.dto';
import { QueryNotificationLogDto } from './dto/query-notification-log.dto';
import { QueryQuotaUtilizationDto } from './dto/query-quota-utilization.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('tenant_admin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('leave-requests')
  leaveRequests(@Query() query: QueryLeaveReportDto) {
    return this.reports.leaveRequestsReport(query);
  }

  @Get('leave-requests/export')
  async exportLeaveRequests(
    @Query() query: QueryLeaveReportDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportLeaveRequestsCsv(query, { userId: user.id, ipAddress: req.ip ?? 'unknown' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="lala-leave-report.csv"');
    res.send(csv);
  }

  @Get('audit-log')
  auditLog(@Query() query: QueryAuditLogDto) {
    return this.reports.auditLogReport(query);
  }

  @Get('audit-log/export')
  async exportAuditLog(
    @Query() query: QueryAuditLogDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportAuditLogCsv(query, { userId: user.id, ipAddress: req.ip ?? 'unknown' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="lala-audit-log.csv"');
    res.send(csv);
  }

  @Get('quota-utilization')
  quotaUtilization(@Query() query: QueryQuotaUtilizationDto) {
    return this.reports.quotaUtilizationReport(query);
  }

  @Get('quota-utilization/export')
  async exportQuotaUtilization(
    @Query() query: QueryQuotaUtilizationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportQuotaUtilizationCsv(query, { userId: user.id, ipAddress: req.ip ?? 'unknown' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="lala-quota-utilization.csv"');
    res.send(csv);
  }

  @Get('approval-turnaround')
  approvalTurnaround(@Query() query: QueryApprovalTurnaroundDto) {
    return this.reports.approvalTurnaroundReport(query);
  }

  @Get('approval-turnaround/export')
  async exportApprovalTurnaround(
    @Query() query: QueryApprovalTurnaroundDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportApprovalTurnaroundCsv(query, { userId: user.id, ipAddress: req.ip ?? 'unknown' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="lala-approval-turnaround.csv"');
    res.send(csv);
  }

  @Get('notification-log')
  notificationLog(@Query() query: QueryNotificationLogDto) {
    return this.reports.notificationLogReport(query);
  }

  @Get('notification-log/export')
  async exportNotificationLog(
    @Query() query: QueryNotificationLogDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const csv = await this.reports.exportNotificationLogCsv(query, { userId: user.id, ipAddress: req.ip ?? 'unknown' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="lala-notification-log.csv"');
    res.send(csv);
  }
}
