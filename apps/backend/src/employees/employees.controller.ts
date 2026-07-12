import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { CurrentUser } from '../auth/current-user.decorator';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateQuotasDto } from './dto/update-quotas.dto';
import { BulkImportEmployeesDto } from './dto/bulk-import-employees.dto';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @Roles('tenant_admin', 'approver')
  list() {
    return this.employees.list();
  }

  @Post()
  @Roles('tenant_admin')
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Post('bulk-import')
  @Roles('tenant_admin')
  bulkImport(@Body() dto: BulkImportEmployeesDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.employees.bulkImport(dto.csvText, { userId: user.id, ipAddress: req.ip ?? 'unknown' });
  }

  @Patch(':id')
  @Roles('tenant_admin')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.employees.update(id, dto, { userId: user.id, ipAddress: req.ip ?? 'unknown' });
  }

  @Get(':id/quotas')
  @Roles('tenant_admin')
  getQuotas(@Param('id') id: string) {
    return this.employees.getQuotas(id);
  }

  @Patch(':id/quotas')
  @Roles('tenant_admin')
  updateQuotas(
    @Param('id') id: string,
    @Body() dto: UpdateQuotasDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.employees.updateQuotas(id, dto.quotas, { userId: user.id, ipAddress: req.ip ?? 'unknown' });
  }
}
