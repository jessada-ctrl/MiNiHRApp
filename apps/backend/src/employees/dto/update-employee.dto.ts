import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  position?: string;

  // Sensitive fields — changing any of these produces an audit log entry
  // (SRS FR-4.6 Audit Log Scope). Everything above this line does not.
  @IsOptional()
  @IsIn(['employee', 'approver', 'tenant_admin'])
  role?: 'employee' | 'approver' | 'tenant_admin';

  @IsOptional()
  @IsString()
  directManagerId?: string | null;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
