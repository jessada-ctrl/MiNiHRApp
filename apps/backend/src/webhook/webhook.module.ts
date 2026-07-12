import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { LineSignatureGuard } from './line-signature.guard';

@Module({
  controllers: [WebhookController],
  providers: [LineSignatureGuard],
})
export class WebhookModule {}
