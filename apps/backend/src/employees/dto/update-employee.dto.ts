import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  // `null` clears the column (all four are nullable, and the FKs are
  // `onDelete: SetNull`). @IsOptional() skips validation for null as well as
  // undefined, so @IsString() only ever runs on a real value — same pattern as
  // directManagerId below.
  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  branchId?: string | null;

  @IsOptional()
  @IsString()
  position?: string | null;

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
