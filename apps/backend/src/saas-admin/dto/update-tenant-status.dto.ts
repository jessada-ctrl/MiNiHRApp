import { IsIn } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

const SUBSCRIPTION_STATUS_VALUES: SubscriptionStatus[] = ['trial', 'active', 'suspended'];

export class UpdateTenantStatusDto {
  @IsIn(SUBSCRIPTION_STATUS_VALUES)
  subscriptionStatus!: SubscriptionStatus;
}
