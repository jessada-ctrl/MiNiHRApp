import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class QueryLeaveReportDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  leaveTypeId?: string;

  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'cancelled'])
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
}
