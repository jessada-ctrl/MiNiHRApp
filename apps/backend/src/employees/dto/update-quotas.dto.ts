import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsString, Min, ValidateNested } from 'class-validator';

class QuotaEntry {
  @IsString()
  leaveTypeId!: string;

  @IsNumber()
  @Min(0)
  totalDays!: number;
}

export class UpdateQuotasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuotaEntry)
  quotas!: QuotaEntry[];
}
