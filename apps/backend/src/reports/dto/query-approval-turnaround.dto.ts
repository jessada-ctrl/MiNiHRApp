import { IsDateString, IsOptional } from 'class-validator';

export class QueryApprovalTurnaroundDto {
  /** Filters historical LeaveApprovalAction rows by actedAt — does not affect the "currently pending" backlog figures, which are always as-of-now. */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
