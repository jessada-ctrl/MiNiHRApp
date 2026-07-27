import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { SaasAdminAuthService } from './saas-admin-auth.service';
import { SaasAdminLoginDto } from './dto/saas-admin-login.dto';
import { SaasAdminAuthGuard } from './saas-admin-auth.guard';
import { CurrentSaasAdmin } from './current-saas-admin.decorator';
import type { AuthenticatedSaasAdmin } from './saas-admin-jwt-payload.interface';

/** §2.2: SaaS Super Admin auth — separate token/session from tenant employee auth (auth/auth.controller.ts). */
@Controller('saas-admin/auth')
export class SaasAdminAuthController {
  constructor(private readonly authService: SaasAdminAuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: SaasAdminLoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(SaasAdminAuthGuard)
  me(@CurrentSaasAdmin() admin: AuthenticatedSaasAdmin) {
    return admin;
  }
}
