import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SaasAdminAuthGuard } from './saas-admin-auth.guard';
import { SaasAdminTenantsService } from './saas-admin-tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';

/** FR-1.1 + §2.2: SaaS Super Admin's tenant lifecycle management — platform-level, not scoped to any single tenant. */
@Controller('saas-admin/tenants')
@UseGuards(SaasAdminAuthGuard)
export class SaasAdminTenantsController {
  constructor(private readonly tenants: SaasAdminTenantsService) {}

  @Get()
  list() {
    return this.tenants.listTenants();
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.createTenant(dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.tenants.updateTenantStatus(id, dto);
  }
}

/** §2.2: "view overall usage" — kept as its own controller/route so it's easy to find, same file grouping style as settings.controller.ts. */
@Controller('saas-admin/overview')
@UseGuards(SaasAdminAuthGuard)
export class SaasAdminOverviewController {
  constructor(private readonly tenants: SaasAdminTenantsService) {}

  @Get()
  overview() {
    return this.tenants.getOverview();
  }
}
