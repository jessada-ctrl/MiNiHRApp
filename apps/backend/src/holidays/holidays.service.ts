import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { buildHolidayFlex } from '../line/holiday-flex';
import { LineMessagingService } from '../line/line-messaging.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';

@Injectable()
export class HolidaysService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: PrismaClient,
    private readonly lineMessaging: LineMessagingService,
  ) {}

  list() {
    return this.prisma.holiday.findMany({ orderBy: { holidayDate: 'asc' } });
  }

  create(dto: CreateHolidayDto) {
    return this.prisma.holiday.create({
      data: {
        tenantId: getCurrentTenantId(),
        holidayDate: new Date(`${dto.date}T00:00:00.000Z`),
        name: dto.name,
        notifyDaysBefore: dto.notifyDaysBefore,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.holiday.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Holiday not found');
    await this.prisma.holiday.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * FR-4.3 (scheduled automation): pushes a Flex Message to every active,
   * LINE-bound employee for each holiday whose configured `notifyDaysBefore`
   * lands on today. Called by SchedulerService once per tenant per day —
   * date-only comparison (UTC) means a holiday only ever matches once, so
   * calling this more than once on the same day is harmless (no dedup
   * needed beyond that).
   */
  async sendDueNotifications(): Promise<number> {
    const holidays = await this.prisma.holiday.findMany();
    const today = new Date();
    const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

    const due = holidays.filter((h) => {
      const notifyUTC = Date.UTC(h.holidayDate.getUTCFullYear(), h.holidayDate.getUTCMonth(), h.holidayDate.getUTCDate()) - h.notifyDaysBefore * 86400000;
      return notifyUTC === todayUTC;
    });
    if (due.length === 0) return 0;

    const employees = await this.prisma.employee.findMany({
      where: { status: 'active', lineUserId: { not: null } },
      select: { lineUserId: true },
    });
    if (employees.length === 0) return 0;

    const tenantId = getCurrentTenantId();
    let sent = 0;
    for (const holiday of due) {
      const { altText, contents } = buildHolidayFlex({ holidayName: holiday.name, holidayDate: holiday.holidayDate });
      await Promise.all(
        employees.map((e) => this.lineMessaging.pushFlex(tenantId, e.lineUserId!, altText, contents, 'holiday_reminder', holiday.id)),
      );
      sent += employees.length;
    }
    return sent;
  }
}
