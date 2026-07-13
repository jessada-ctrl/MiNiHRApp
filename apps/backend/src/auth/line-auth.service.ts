import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';
import { OtpMailerService } from './otp-mailer.service';

const OTP_TTL_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;

interface ActorContext {
  ipAddress: string;
}

@Injectable()
export class LineAuthService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly mailer: OtpMailerService,
  ) {}

  /**
   * FR-2.1 step 1: employee enters their code + company email in the LIFF
   * app; if they match an active employee, generate + email a 6-digit OTP.
   * Always returns the same generic message regardless of match, so this
   * endpoint can't be used to enumerate valid employeeCode/email pairs.
   */
  async requestOtp(employeeCode: string, email: string): Promise<{ message: string }> {
    const tenantId = getCurrentTenantId();
    const message = 'หากข้อมูลถูกต้อง ระบบได้ส่งรหัส OTP ไปยังอีเมลบริษัทของคุณแล้ว (หมดอายุใน 5 นาที)';

    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, employeeCode, email, status: 'active' },
      select: { id: true },
    });
    if (!employee) return { message };

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otpCodeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await this.prisma.otpVerification.create({
      data: { tenantId, employeeId: employee.id, employeeCode, email, otpCodeHash, expiresAt },
    });

    await this.mailer.send(email, code);
    return { message };
  }

  /**
   * FR-2.1 step 2: verify the OTP and, on success, bind `lineUserId` to the
   * employee and issue a session JWT (same shape `POST /auth/login`
   * returns) so the LIFF app can move straight into normal use, matching
   * the spec's "ผูกเสร็จ → เปลี่ยน Rich Menu เป็นเมนูใช้งานปกติ" flow.
   *
   * `lineUserId` here is whatever the LIFF SDK's `liff.getProfile()` would
   * return in a real deployment — there's no real LINE account set up yet,
   * so the frontend currently accepts it as a manually-entered dev/testing
   * value. Once real LIFF credentials exist, verifying the LIFF ID token's
   * signature server-side (via LINE's JWKS) instead of trusting this value
   * at face value is the remaining NFR-3 hardening step for this endpoint.
   */
  async verifyOtp(
    employeeCode: string,
    email: string,
    otpCode: string,
    lineUserId: string,
    actor: ActorContext,
  ): Promise<{ accessToken: string; user: AuthenticatedUser }> {
    const tenantId = getCurrentTenantId();

    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, employeeCode, email, status: 'active' },
    });
    if (!employee) throw new BadRequestException('Invalid employee code, email, or OTP');

    const otp = await this.prisma.otpVerification.findFirst({
      where: { tenantId, employeeCode, email, verifiedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new BadRequestException('Invalid employee code, email, or OTP');
    if (otp.expiresAt < new Date()) throw new BadRequestException('OTP has expired — please request a new one');
    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Too many incorrect attempts — please request a new OTP');
    }

    const codeOk = await bcrypt.compare(otpCode, otp.otpCodeHash);
    if (!codeOk) {
      await this.prisma.otpVerification.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Invalid OTP code');
    }

    const boundToSomeoneElse = await this.prisma.employee.findFirst({
      where: { tenantId, lineUserId, id: { not: employee.id } },
      select: { id: true },
    });
    if (boundToSomeoneElse) {
      throw new BadRequestException('This LINE account is already linked to a different employee');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id: employee.id }, data: { lineUserId } });
      await tx.otpVerification.update({ where: { id: otp.id }, data: { verifiedAt: new Date(), employeeId: employee.id } });
      await this.audit.record(tx, {
        userId: employee.id,
        action: `employee.line-bind — ${employeeCode}`,
        targetTable: 'employees',
        targetId: employee.id,
        ipAddress: actor.ipAddress,
      });
    });

    const payload: JwtPayload = {
      sub: employee.id,
      tenantId: employee.tenantId,
      role: employee.role as JwtPayload['role'],
      email: employee.email,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: employee.id,
        tenantId: employee.tenantId,
        role: employee.role as JwtPayload['role'],
        email: employee.email,
        fullName: employee.fullName,
      },
    };
  }
}
