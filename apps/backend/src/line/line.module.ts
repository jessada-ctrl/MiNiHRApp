import { Module } from '@nestjs/common';
import { LineMessagingService } from './line-messaging.service';

/**
 * Shared home for LINE push messaging so both ChatbotModule and
 * LeaveRequestsModule can depend on it without a circular import
 * (ChatbotModule already imports LeaveRequestsModule for the chatbot's
 * leave-quota Q&A).
 */
@Module({
  providers: [LineMessagingService],
  exports: [LineMessagingService],
})
export class LineModule {}
