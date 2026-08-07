import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateLineConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  lineChannelId?: string;

  /**
   * The tenant's own LIFF app id, served to the LIFF front-end at runtime by
   * PublicTenantConfigController. Shape-checked here (numeric app id, hyphen,
   * alphanumeric suffix) because a typo'd value doesn't fail loudly — the
   * LIFF SDK just never initialises and every employee gets a blank screen,
   * which is far more expensive to diagnose than a 400 at save time.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d+-[a-zA-Z0-9]+$/, {
    message: 'lineLiffId must look like "1234567890-abcdEFGh" (the LIFF ID from the LINE Developers console)',
  })
  lineLiffId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lineChannelSecret?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lineChannelAccessToken?: string;
}
