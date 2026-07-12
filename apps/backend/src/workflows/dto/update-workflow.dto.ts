import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(['department', 'branch', 'leave_type', 'global'])
  scopeType?: 'department' | 'branch' | 'leave_type' | 'global';

  @IsOptional()
  @IsString()
  scopeId?: string | null;
}
