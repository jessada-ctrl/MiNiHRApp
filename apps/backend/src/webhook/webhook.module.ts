import { Module } from '@nestjs/common';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { WebhookController } from './webhook.controller';
import { LineSignatureGuard } from './line-signature.guard';

@Module({
  imports: [ChatbotModule],
  controllers: [WebhookController],
  providers: [LineSignatureGuard],
})
export class WebhookModule {}
