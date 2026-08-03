import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';

/** FR-2.3 (employee check-in/out) and FR-4.5's QR half (geofencing itself lives on /branches — see org.controller.ts). */
@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.attendance.status(user.id);
  }

  @Post('check')
  check(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckInDto) {
    return this.attendance.check(user.id, dto);
  }

  @Get('qr-codes/:branchId')
  @Roles('tenant_admin')
  getTodayQrCode(@Param('branchId') branchId: string) {
    return this.attendance.getTodayQrCode(branchId);
  }

  @Post('qr-codes/:branchId/generate')
  @Roles('tenant_admin')
  generateQrCode(
    @Param('branchId') branchId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.attendance.generateQrCode(branchId, {
      userId: user.id,
      ipAddress: req.ip ?? 'unknown',
    });
  }
}
