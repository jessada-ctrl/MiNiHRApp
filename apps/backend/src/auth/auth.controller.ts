import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LineAuthService } from './line-auth.service';
import { LoginDto } from './dto/login.dto';
import { LineLoginDto } from './dto/line-login.dto';
import { RequestLineOtpDto } from './dto/request-line-otp.dto';
import { VerifyLineOtpDto } from './dto/verify-line-otp.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './jwt-payload.interface';
import { PasswordService } from './password.service';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';

/**
 * Every unauthenticated endpoint here is rate limited per IP.
 *
 * These are the only routes where an anonymous caller can make the server do
 * expensive work (bcrypt) or send email, and the only ones where repetition
 * is itself the attack: password spraying on `login`, and using
 * `line/request-otp` as a free mail cannon against an employee's inbox.
 * The per-OTP `attempts` counter already caps guesses against one issued
 * code; these caps are about the rate of *new* attempts.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly lineAuthService: LineAuthService,
    private readonly password: PasswordService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { ttl: 300_000, limit: 10 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  // Tighter than login: each call sends a real email, so an unthrottled
  // endpoint lets anyone flood a colleague's inbox with OTPs.
  @Post('line/request-otp')
  @HttpCode(200)
  @Throttle({ default: { ttl: 300_000, limit: 5 } })
  requestLineOtp(@Body() dto: RequestLineOtpDto) {
    return this.lineAuthService.requestOtp(dto.employeeCode, dto.email);
  }

  @Post('line/verify-otp')
  @HttpCode(200)
  @Throttle({ default: { ttl: 300_000, limit: 15 } })
  verifyLineOtp(@Body() dto: VerifyLineOtpDto, @Req() req: Request) {
    return this.lineAuthService.verifyOtp(dto.employeeCode, dto.email, dto.otpCode, dto.lineUserId, {
      ipAddress: req.ip ?? 'unknown',
    });
  }

  /**
   * Silent re-auth for an already-registered LINE account — see
   * LineAuthService.loginWithIdToken. Runs automatically on every LIFF page
   * load, so its limit is looser than the others: it has to survive an
   * employee navigating around the app, and a whole office can share one
   * office-wifi IP.
   */
  @Post('line/login')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  lineLogin(@Body() dto: LineLoginDto) {
    return this.lineAuthService.loginWithIdToken(dto.idToken);
  }

  @Post('change-password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 300_000, limit: 10 } })
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.password.changePassword(user, dto.currentPassword, dto.newPassword, { ipAddress: req.ip ?? 'unknown' });
  }

  /**
   * Tightest limit of the lot: each call sends a real email to an address
   * the caller merely names, so this is the endpoint most usable as a
   * harassment tool against someone else's inbox.
   */
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { ttl: 900_000, limit: 3 } })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.password.requestReset(dto.email, this.resetUrlBase(req));
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.password.resetPassword(dto.token, dto.newPassword, { ipAddress: req.ip ?? 'unknown' });
  }

  /**
   * Where the emailed link points.
   *
   * Built from the request's own Host — which TenantMiddleware has already
   * matched against a real tenant subdomain — and never from anything in the
   * request body. A caller-supplied return URL would turn forgot-password
   * into a phishing tool: a genuine, company-branded email carrying an
   * attacker's link.
   *
   * PASSWORD_RESET_URL_BASE overrides it for local development, where the
   * API answers on :3001 but web-admin runs on its own :3000 with no
   * /admin basePath.
   */
  private resetUrlBase(req: Request): string {
    const override = process.env.PASSWORD_RESET_URL_BASE?.trim();
    if (override) return override.replace(/\/+$/, '');
    return `${req.protocol}://${req.get('host') ?? ''}/admin/reset-password`;
  }
}
