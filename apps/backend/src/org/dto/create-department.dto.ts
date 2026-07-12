import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

// Loose UUID-shaped check (not strict @IsUUID()) — this codebase's seed
// fixtures use readable ids like "00000000-0000-0000-0000-000000000001",
// which are not valid RFC4122 v1-8 UUIDs (the version nibble is "0") and
// would be wrongly rejected by a strict version-aware check.
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateDepartmentDto {
  @IsString()
  @MinLength(1)
  departmentName!: string;

  @IsOptional()
  @Matches(UUID_SHAPE, { message: 'branchId must be a valid id' })
  branchId?: string;
}
