import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { CreateHolidayDto } from './dto/create-holiday.dto';

@Injectable()
export class HolidaysService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: PrismaClient) {}

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
}
