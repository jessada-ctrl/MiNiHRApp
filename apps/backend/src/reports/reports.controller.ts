import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { ReportsService } from './reports.service';
import { QueryLeaveReportDto } from './dto/query-leave-report.dto';

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
}
