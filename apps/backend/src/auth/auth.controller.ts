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
}
