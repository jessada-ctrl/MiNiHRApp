import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload.interface';
import { SettingsService } from './settings.service';
import { UpdateLineConfigDto } from './dto/update-line-config.dto';
import { UpdateChatbotConfigDto } from './dto/update-chatbot-config.dto';

/** FR-1.2: Tenant Admin-only LINE OA credential management. Not readable by approver — company LINE secrets are more sensitive than org structure. */
@Controller('settings/line-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Roles('tenant_admin')
  getLineConfig() {
    return this.settings.getLineConfig();
  }

  @Patch()
  @Roles('tenant_admin')
  updateLineConfig(@Body() dto: UpdateLineConfigDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.settings.updateLineConfig(dto, { userId: user.id, ipAddress: req.ip ?? 'unknown' });
  }
}

/** Tenant Admin-only control over who the LINE chatbot will answer "who is on leave today" for — HR itself can always ask regardless of this setting. */
@Controller('settings/chatbot-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatbotSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Roles('tenant_admin')
  getChatbotConfig() {
    return this.settings.getChatbotConfig();
  }

  @Patch()
  @Roles('tenant_admin')
  updateChatbotConfig(@Body() dto: UpdateChatbotConfigDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.settings.updateChatbotConfig(dto, { userId: user.id, ipAddress: req.ip ?? 'unknown' });
  }
}
