import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Length only, no character-class rules. NIST SP 800-63B dropped composition
 * requirements because they push people toward predictable substitutions
 * ("Password1!") rather than longer passphrases. The upper bound is there
 * because bcrypt silently truncates at 72 bytes — accepting more would mean
 * quietly ignoring the tail of a long password.
 */
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, { message: `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร` })
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, { message: `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร` })
  @MaxLength(MAX_PASSWORD_LENGTH)
  newPassword!: string;
}
