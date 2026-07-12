import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowStepDto } from './dto/workflow-step.dto';

@Injectable()
export class WorkflowsService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: PrismaClient) {}

  list() {
    return this.prisma.approvalWorkflow.findMany({
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: { approverEmployee: { select: { id: true, fullName: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  private validateSteps(steps: WorkflowStepDto[]) {
    for (const s of steps) {
      if (s.approverType === 'specific_employee' && !s.approverEmployeeId) {
        throw new BadRequestException('approverEmployeeId is required when approverType is specific_employee');
      }
    }
  }

  async create(dto: CreateWorkflowDto) {
    this.validateSteps(dto.steps);
    const tenantId = getCurrentTenantId();

    return this.prisma.$transaction(async (tx) => {
      const workflow = await tx.approvalWorkflow.create({
        data: { tenantId, name: dto.name, scopeType: dto.scopeType, scopeId: dto.scopeId },
      });

      await tx.approvalWorkflowStep.createMany({
        data: dto.steps.map((s, i) => ({
          tenantId,
          workflowId: workflow.id,
          stepOrder: i,
          approverType: s.approverType,
          approverEmployeeId: s.approverType === 'specific_employee' ? s.approverEmployeeId : null,
        })),
      });

      return tx.approvalWorkflow.findUniqueOrThrow({
        where: { id: workflow.id },
        include: { steps: { orderBy: { stepOrder: 'asc' }, include: { approverEmployee: { select: { id: true, fullName: true } } } } },
      });
    });
  }

  async update(id: string, dto: UpdateWorkflowDto) {
    const existing = await this.prisma.approvalWorkflow.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Workflow not found');

    return this.prisma.approvalWorkflow.update({
      where: { id },
      data: { name: dto.name, scopeType: dto.scopeType, scopeId: dto.scopeId },
    });
  }

  /**
   * Replaces the entire ordered step list — this is what the drag-and-drop
   * reorder UI (FR-4.1) calls on every reorder/add/remove, not a partial
   * patch. Existing LeaveRequests keep their own workflowSnapshot copied at
   * submission time, so rewriting steps here never disturbs in-flight
   * approvals.
   */
  async updateSteps(workflowId: string, steps: WorkflowStepDto[]) {
    this.validateSteps(steps);
    const tenantId = getCurrentTenantId();

    const workflow = await this.prisma.approvalWorkflow.findUnique({ where: { id: workflowId } });
    if (!workflow) throw new NotFoundException('Workflow not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.approvalWorkflowStep.deleteMany({ where: { workflowId } });
      await tx.approvalWorkflowStep.createMany({
        data: steps.map((s, i) => ({
          tenantId,
          workflowId,
          stepOrder: i,
          approverType: s.approverType,
          approverEmployeeId: s.approverType === 'specific_employee' ? s.approverEmployeeId : null,
        })),
      });

      return tx.approvalWorkflowStep.findMany({
        where: { workflowId },
        orderBy: { stepOrder: 'asc' },
        include: { approverEmployee: { select: { id: true, fullName: true } } },
      });
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.approvalWorkflow.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Workflow not found');
    await this.prisma.approvalWorkflow.delete({ where: { id } });
    return { deleted: true };
  }
}
