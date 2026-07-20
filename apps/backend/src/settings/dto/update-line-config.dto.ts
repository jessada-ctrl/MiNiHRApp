import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateLineConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  lineChannelId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lineChannelSecret?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lineChannelAccessToken?: string;
}
