import { IsDateString, IsInt, IsString, Min, MinLength } from 'class-validator';

export class CreateHolidayDto {
  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(0)
  notifyDaysBefore!: number;
}
