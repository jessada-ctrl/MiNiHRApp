import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateLeaveTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultQuota?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  requiresAttachmentAfterDays?: number | null;

  @IsOptional()
  @IsBoolean()
  allowHourly?: boolean;
}
