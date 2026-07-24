import { Module } from '@nestjs/common';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { EmployeesModule } from '../employees/employees.module';
import { LeaveRequestsModule } from '../leave-requests/leave-requests.module';
import { LineModule } from '../line/line.module';
import { WebhookController } from './webhook.controller';
import { LineSignatureGuard } from './line-signature.guard';

@Module({
  imports: [ChatbotModule, LineModule, EmployeesModule, LeaveRequestsModule],
  controllers: [WebhookController],
  providers: [LineSignatureGuard],
})
export class WebhookModule {}
