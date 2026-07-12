import { IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @MinLength(1)
  branchName!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsInt()
  @Min(1)
  radiusMeters!: number;
}
