import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class VerifyLineOtpDto {
  @IsString()
  @MinLength(1)
  employeeCode!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  otpCode!: string;

  @IsString()
  @MinLength(1)
  lineUserId!: string;
}
