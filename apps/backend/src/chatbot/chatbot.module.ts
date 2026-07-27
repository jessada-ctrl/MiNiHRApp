import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { LeaveRequestsModule } from '../leave-requests/leave-requests.module';
import { LeaveTypesModule } from '../leave-types/leave-types.module';
import { LineModule } from '../line/line.module';
import { SettingsModule } from '../settings/settings.module';
import { ChatbotOrchestratorService } from './chatbot-orchestrator.service';
import { ChatbotService } from './chatbot.service';
import { HrChatbotService } from './hr-chatbot.service';

@Module({
  imports: [EmployeesModule, LeaveRequestsModule, LeaveTypesModule, HolidaysModule, LineModule, SettingsModule],
  providers: [ChatbotService, HrChatbotService, ChatbotOrchestratorService],
  exports: [ChatbotOrchestratorService],
})
export class ChatbotModule {}
