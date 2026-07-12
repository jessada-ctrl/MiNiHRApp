import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { WorkflowStepDto } from './workflow-step.dto';

export class CreateWorkflowDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(['department', 'branch', 'leave_type', 'global'])
  scopeType!: 'department' | 'branch' | 'leave_type' | 'global';

  @IsOptional()
  @IsString()
  scopeId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];
}
