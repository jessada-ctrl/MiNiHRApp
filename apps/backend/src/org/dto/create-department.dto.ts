import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @MinLength(1)
  departmentName!: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
