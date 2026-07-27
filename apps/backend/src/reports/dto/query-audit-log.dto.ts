import { IsDateString, IsOptional, IsString } from 'class-validator';

export class QueryAuditLogDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  targetTable?: string;

  /** Substring match against the freeform `action` field (e.g. "employee.update"). */
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  userId?: string;
}
