import { IsString, MinLength } from 'class-validator';

export class BulkImportEmployeesDto {
  @IsString()
  @MinLength(1)
  csvText!: string;
}
