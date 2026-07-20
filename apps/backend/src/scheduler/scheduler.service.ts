import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { tenantContext } from '../tenant/tenant-context';
import { HolidaysService } from '../holidays/holidays.service';
import { LeaveRequestsService } from '../leave-requests/leave-requests.service';

/**
 * Cross-tenant background jobs (FR-3.3, FR-4.3's automation). Runs outside
 * any HTTP request, so there's no AsyncLocalStorage tenant context set up
 * for it the way TenantMiddleware does per-request — this service creates
 * that context itself per tenant via `tenantContext.run(...)`, which lets
 * it call the existing TENANT_PRISMA-scoped services (LeaveRequestsService,
 * HolidaysService) completely unmodified, the same as if a real request for
 * that tenant were in flight.
 *
 * Only tenants with a configured LINE channel access token are processed —
 * there's nowhere to push a notification for one that hasn't done FR-1.2 yet.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveRequests: LeaveRequestsService,
    private readonly holidays: HolidaysService,
  ) {}

  @Cron('0 9 * * *')
  async runDailyJobs() {
    const tenants = await this.prisma.tenant.findMany({
      where: { lineChannelAccessTokenEnc: { not: null } },
      select: { id: true, companyName: true },
    });

    for (const tenant of tenants) {
      await tenantContext.run({ tenantId: tenant.id }, async () => {
        try {
          const reminders = await this.leaveRequests.remindPendingApprovers();
          if (reminders > 0) this.logger.log(`Sent ${reminders} approval reminder(s) for tenant ${tenant.companyName}`);
        } catch (err) {
          this.logger.error(`Reminder sweep failed for tenant ${tenant.companyName}: ${err instanceof Error ? err.message : String(err)}`);
        }

        try {
          const holidayNotices = await this.holidays.sendDueNotifications();
          if (holidayNotices > 0) this.logger.log(`Sent ${holidayNotices} holiday notice(s) for tenant ${tenant.companyName}`);
        } catch (err) {
          this.logger.error(`Holiday notice sweep failed for tenant ${tenant.companyName}: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    }
  }
}
