import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { EncryptionService } from '../crypto/encryption.service';
import { AuditService } from '../audit/audit.service';
import { CheckInDto } from './dto/check-in.dto';
import { haversineMeters } from './geo.util';

interface ActorContext {
  userId: string;
  ipAddress: string;
}

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function startOfTomorrowUTC(): Date {
  return new Date(startOfTodayUTC().getTime() + 24 * 60 * 60 * 1000);
}

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: PrismaClient,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  private todayLogs(employeeId: string) {
    return this.prisma.attendanceLog.findMany({
      where: {
        employeeId,
        timestamp: { gte: startOfTodayUTC(), lt: startOfTomorrowUTC() },
      },
      orderBy: { timestamp: 'asc' },
      include: { branch: { select: { id: true, branchName: true } } },
    });
  }

  /** Home-tab state: today's punches so far and which action (in/out) comes next — FR-2.3. */
  async status(employeeId: string) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: {
        branch: {
          select: {
            id: true,
            branchName: true,
            address: true,
            latitude: true,
            longitude: true,
            radiusMeters: true,
          },
        },
      },
    });
    const logs = await this.todayLogs(employeeId);
    const last = logs[logs.length - 1] ?? null;

    return {
      branch: employee.branch,
      todayLogs: logs.map((l) => ({
        id: l.id,
        checkType: l.checkType,
        method: l.method,
        timestamp: l.timestamp,
        branchName: l.branch?.branchName ?? null,
      })),
      nextAction: !last || last.checkType === 'out' ? 'in' : 'out',
    };
  }

  /**
   * FR-2.3: record a check-in/out. Direction (in vs out) is derived
   * server-side from today's existing logs — never trusted from the client —
   * so a replayed or forged request can't flip an "out" into a second "in".
   */
  async check(employeeId: string, dto: CheckInDto) {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      include: { branch: true },
    });

    const logs = await this.todayLogs(employeeId);
    const last = logs[logs.length - 1] ?? null;
    const checkType: 'in' | 'out' =
      !last || last.checkType === 'out' ? 'in' : 'out';

    let branchId: string;
    let branchForResponse: {
      id: string;
      branchName: string;
      address: string | null;
      radiusMeters: number;
    };
    let latitudeEnc: string | undefined;
    let longitudeEnc: string | undefined;
    let distanceMeters: number | undefined;

    if (dto.method === 'qr') {
      if (!dto.qrToken)
        throw new BadRequestException('qrToken is required for method "qr"');

      const today = startOfTodayUTC();
      const qr = await this.prisma.attendanceQrCode.findUnique({
        where: { qrToken: dto.qrToken },
        include: { branch: true },
      });
      if (!qr || qr.validDate.getTime() !== today.getTime()) {
        throw new BadRequestException('QR Code ไม่ถูกต้องหรือหมดอายุ');
      }

      branchId = qr.branchId;
      branchForResponse = qr.branch;
    } else {
      if (dto.latitude === undefined || dto.longitude === undefined) {
        throw new BadRequestException(
          'latitude/longitude are required for method "gps"',
        );
      }
      if (!employee.branch) {
        throw new BadRequestException('พนักงานยังไม่ได้ผูกสาขา กรุณาติดต่อ HR');
      }

      const branch = employee.branch;
      distanceMeters = haversineMeters(
        dto.latitude,
        dto.longitude,
        branch.latitude.toNumber(),
        branch.longitude.toNumber(),
      );
      if (distanceMeters > branch.radiusMeters) {
        throw new BadRequestException(
          `อยู่นอกระยะที่กำหนด (ห่างจากสาขา ${Math.round(distanceMeters)} ม. ในขณะที่รัศมีที่อนุญาตคือ ${branch.radiusMeters} ม.)`,
        );
      }

      branchId = branch.id;
      branchForResponse = branch;
      latitudeEnc = this.encryption.encrypt(String(dto.latitude));
      longitudeEnc = this.encryption.encrypt(String(dto.longitude));
    }

    const log = await this.prisma.attendanceLog.create({
      // The tenant-scoping extension injects tenantId too, but the static
      // Prisma types don't know that — pass it explicitly so this type-checks.
      data: {
        tenantId: getCurrentTenantId(),
        employeeId,
        branchId,
        checkType,
        method: dto.method,
        latitudeEnc,
        longitudeEnc,
      },
    });

    return {
      id: log.id,
      checkType: log.checkType,
      method: log.method,
      timestamp: log.timestamp,
      branch: branchForResponse,
      distanceMeters:
        distanceMeters !== undefined ? Math.round(distanceMeters) : undefined,
    };
  }

  async getTodayQrCode(branchId: string) {
    await this.assertBranch(branchId);
    const qr = await this.prisma.attendanceQrCode.findFirst({
      where: { branchId, validDate: startOfTodayUTC() },
    });
    return qr ? { qrToken: qr.qrToken, validDate: qr.validDate } : null;
  }

  /** FR-4.5: (re)generate today's dynamic QR token for a branch — overwriting it invalidates the previous one immediately. */
  async generateQrCode(branchId: string, actor: ActorContext) {
    const tenantId = getCurrentTenantId();
    const branch = await this.assertBranch(branchId);
    const today = startOfTodayUTC();
    const qrToken = crypto.randomBytes(16).toString('hex');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.attendanceQrCode.findFirst({
        where: { branchId, validDate: today },
      });
      const qr = existing
        ? await tx.attendanceQrCode.update({
            where: { id: existing.id },
            data: { qrToken },
          })
        : await tx.attendanceQrCode.create({
            data: { tenantId, branchId, qrToken, validDate: today },
          });

      await this.audit.record(tx, {
        userId: actor.userId,
        action: `attendance.qr-code.generate — ${branch.branchName}`,
        targetTable: 'attendance_qr_codes',
        targetId: qr.id,
        ipAddress: actor.ipAddress,
      });

      return { qrToken: qr.qrToken, validDate: qr.validDate };
    });
  }

  private async assertBranch(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }
}
