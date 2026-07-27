import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

// The only two values LineMessagingService.push() ever writes (see
// line-messaging.service.ts) — status is a plain string column in the
// schema (no Prisma enum), so validated here instead.
const NOTIFICATION_STATUS_VALUES = ['sent', 'failed'] as const;

export class QueryNotificationLogDto {
  @IsOptional()
  @IsString()
  messageType?: string;

  @IsOptional()
  @IsIn(NOTIFICATION_STATUS_VALUES)
  status?: (typeof NOTIFICATION_STATUS_VALUES)[number];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
