import { Module } from '@nestjs/common';
import { PublicTenantConfigController } from './public-tenant-config.controller';
import { ChatbotSettingsController, SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController, ChatbotSettingsController, PublicTenantConfigController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
