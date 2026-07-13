import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class VerifyLineOtpDto {
  @IsString()
  @MinLength(1)
  employeeCode!: string;

  @IsEmail()
  email!: string;

  @Matches(/^\d{6}$/, { message: 'otpCode must be exactly 6 digits' })
  otpCode!: string;

  @IsString()
  @MinLength(1)
  lineUserId!: string;
}
