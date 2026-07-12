import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { UpdateWorkflowStepsDto } from './dto/update-workflow-steps.dto';

@Controller('approval-workflows')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  @Roles('tenant_admin', 'approver')
  list() {
    return this.workflows.list();
  }

  @Post()
  @Roles('tenant_admin')
  create(@Body() dto: CreateWorkflowDto) {
    return this.workflows.create(dto);
  }

  @Patch(':id')
  @Roles('tenant_admin')
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.update(id, dto);
  }

  @Patch(':id/steps')
  @Roles('tenant_admin')
  updateSteps(@Param('id') id: string, @Body() dto: UpdateWorkflowStepsDto) {
    return this.workflows.updateSteps(id, dto.steps);
  }

  @Delete(':id')
  @Roles('tenant_admin')
  remove(@Param('id') id: string) {
    return this.workflows.remove(id);
  }
}
