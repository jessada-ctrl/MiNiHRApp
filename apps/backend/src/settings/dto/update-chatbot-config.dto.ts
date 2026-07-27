import { IsIn } from 'class-validator';
import { ChatbotLeaveVisibility } from '@prisma/client';

const VISIBILITY_VALUES: ChatbotLeaveVisibility[] = ['hr_only', 'hr_and_approver', 'everyone'];

export class UpdateChatbotConfigDto {
  @IsIn(VISIBILITY_VALUES)
  whoIsOnLeaveVisibility!: ChatbotLeaveVisibility;
}
