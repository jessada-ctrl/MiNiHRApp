import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { CurrentUser } from '../auth/current-user.decorator';
import { OrgService } from './org.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

/** Org structure CRUD — branches (incl. attendance geofencing per FR-4.5) and departments, per FR-4.6. */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('branches')
  @Roles('tenant_admin', 'approver')
  branches() {
    return this.org.listBranches();
  }

  @Post('branches')
  @Roles('tenant_admin')
  createBranch(@Body() dto: CreateBranchDto) {
    return this.org.createBranch(dto);
  }

  @Patch('branches/:id')
  @Roles('tenant_admin')
  updateBranch(@Param('id') id: string, @Body() dto: UpdateBranchDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.org.updateBranch(id, dto, { userId: user.id, ipAddress: req.ip ?? 'unknown' });
  }

  @Get('departments')
  @Roles('tenant_admin', 'approver')
  departments() {
    return this.org.listDepartments();
  }

  @Post('departments')
  @Roles('tenant_admin')
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.org.createDepartment(dto);
  }

  @Patch('departments/:id')
  @Roles('tenant_admin')
  updateDepartment(@Param('id') id: string, @Body() dto: UpdateDepartmentDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.org.updateDepartment(id, dto, { userId: user.id, ipAddress: req.ip ?? 'unknown' });
  }
}
