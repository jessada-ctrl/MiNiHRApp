import { IsString, MinLength } from 'class-validator';

export class RejectLeaveRequestDto {
  @IsString()
  @MinLength(1)
  comment!: string;
}
