import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { LeaveRequestsService } from './leave-requests.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { RejectLeaveRequestDto } from './dto/reject-leave-request.dto';

@Controller('leave-requests')
@UseGuards(JwtAuthGuard)
export class LeaveRequestsController {
  constructor(private readonly leaveRequests: LeaveRequestsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeaveRequestDto) {
    return this.leaveRequests.create(user.id, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveRequests.listMine(user.id);
  }

  @Get('my-quota-summary')
  myQuotaSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveRequests.myQuotaSummary(user.id);
  }

  @Get('pending-for-me')
  pendingForMe(@CurrentUser() user: AuthenticatedUser) {
    return this.leaveRequests.pendingForApprover(user.id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leaveRequests.cancel(id, user.id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leaveRequests.approve(id, user.id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: RejectLeaveRequestDto) {
    return this.leaveRequests.reject(id, user.id, dto.comment);
  }
}
