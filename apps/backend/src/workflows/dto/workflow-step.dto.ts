import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * 'role' exists in the Prisma ApproverType enum for future use, but there is
 * no role/title system built yet to resolve it against — only these two
 * are actually usable right now. Pick a specific person for anything that
 * isn't literally "the requester's direct manager."
 */
export class WorkflowStepDto {
  @IsIn(['specific_employee', 'direct_manager'])
  approverType!: 'specific_employee' | 'direct_manager';

  @IsOptional()
  @IsString()
  approverEmployeeId?: string;
}
