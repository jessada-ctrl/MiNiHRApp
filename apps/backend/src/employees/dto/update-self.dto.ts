import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Self-service profile edit — deliberately excludes role, status,
 * directManagerId, departmentId, branchId, employeeCode: those stay
 * tenant_admin-only (SRS FR-4.6 reserves them for HR Admin), so they're not
 * fields on this DTO at all rather than fields the service silently drops.
 */
export class UpdateSelfDto {
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
}
