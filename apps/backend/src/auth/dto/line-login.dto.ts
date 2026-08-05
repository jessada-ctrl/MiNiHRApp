import { IsString, MinLength } from 'class-validator';

export class LineLoginDto {
  @IsString()
  @MinLength(1)
  idToken!: string;
}
