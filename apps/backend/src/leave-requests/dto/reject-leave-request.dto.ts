import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class RejectLeaveRequestDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'comment must not be empty or whitespace-only' })
  comment!: string;
}
