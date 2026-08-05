import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly lineAuthService: LineAuthService,
  ) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post('line/request-otp')
  @HttpCode(200)
  requestLineOtp(@Body() dto: RequestLineOtpDto) {
    return this.lineAuthService.requestOtp(dto.employeeCode, dto.email);
  }

  @Post('line/verify-otp')
  @HttpCode(200)
  verifyLineOtp(@Body() dto: VerifyLineOtpDto, @Req() req: Request) {
    return this.lineAuthService.verifyOtp(dto.employeeCode, dto.email, dto.otpCode, dto.lineUserId, {
      ipAddress: req.ip ?? 'unknown',
    });
  }

  /** Silent re-auth for an already-registered LINE account — see LineAuthService.loginWithIdToken. */
  @Post('line/login')
  @HttpCode(200)
  lineLogin(@Body() dto: LineLoginDto) {
    return this.lineAuthService.loginWithIdToken(dto.idToken);
  }
}
