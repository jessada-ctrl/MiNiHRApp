import { Module } from '@nestjs/common';
import { ChatbotSettingsController, SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController, ChatbotSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
