import { IsEmail, IsString, MinLength } from 'class-validator';

export class RequestLineOtpDto {
  @IsString()
  @MinLength(1)
  employeeCode!: string;

  @IsEmail()
  email!: string;
}
