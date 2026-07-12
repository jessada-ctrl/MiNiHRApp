import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateLeaveRequestDto {
  @IsString()
  leaveTypeId!: string;

  @IsIn(['full_day', 'half_am', 'half_pm', 'hourly'])
  durationType!: 'full_day' | 'half_am' | 'half_pm' | 'hourly';

  @IsDateString()
  startDate!: string;

  // full_day only — defaults to startDate when omitted (single-day leave)
  @IsOptional()
  @IsDateString()
  endDate?: string;

  // hourly only
  @IsOptional()
  @Matches(TIME_RE, { message: 'startTime must be HH:MM' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_RE, { message: 'endTime must be HH:MM' })
  endTime?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsBoolean()
  lwopAcknowledged?: boolean;
}
