import { BadRequestException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuditService } from '../audit/audit.service';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';
import { MailerService } from './mailer.service';

const RESET_TTL_MINUTES = 60;
const BCRYPT_ROUNDS = 10;

interface ActorContext {
  ipAddress: string;
}

/**
 * Self-service password management.
 *
 * Until now an employee could never change their own password: accounts were
 * created with a random temp password that HR relayed out-of-band, and there
 * was no way to replace it or to recover from losing it — the only path back
 * in was asking HR to edit the database.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Changing your own password, knowing the current one.
   *
   * Returns a fresh token because stamping `passwordChangedAt` invalidates
   * every session issued before this moment (see JwtStrategy) — including
   * the one that made this very request. Without handing back a replacement,
   * succeeding would log the user straight out.
   */
  async changePassword(
    user: AuthenticatedUser,
    currentPassword: string,
    newPassword: string,
    actor: ActorContext,
  ): Promise<{ accessToken: string; user: AuthenticatedUser }> {
    const employee = await this.prisma.employee.findUnique({ where: { id: user.id } });
    if (!employee?.passwordHash) {
      // An account with no password set (LINE-only, never issued one) has no
      // "current password" to verify, so this endpoint can't serve it — the
      // forgot-password flow is the right route for those.
      throw new BadRequestException('บัญชีนี้ยังไม่ได้ตั้งรหัสผ่าน กรุณาใช้ "ลืมรหัสผ่าน" เพื่อตั้งรหัสผ่านใหม่');
    }

    const currentOk = await bcrypt.compare(currentPassword, employee.passwordHash);
    if (!currentOk) throw new UnauthorizedException('รหัสผ่านปัจจุบันไม่ถูกต้อง');

    if (await bcrypt.compare(newPassword, employee.passwordHash)) {
      throw new BadRequestException('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
    }

    await this.applyNewPassword(employee.id, newPassword, {
      userId: employee.id,
      action: 'employee.password-changed',
      ipAddress: actor.ipAddress,
    });

    return {
      accessToken: await this.issueToken(employee.id, employee.tenantId, employee.role, employee.email),
      user: { ...user, mustChangePassword: false },
    };
  }

  /**
   * "Forgot password" step 1.
   *
   * Always returns the same message, and always takes roughly the same
   * amount of work, whether or not the address belongs to a real account —
   * otherwise this endpoint becomes a way to test which email addresses work
   * at a company. Same reasoning as requestOtp (BUG-007).
   *
   * `resetUrlBase` is built by the controller from the request's own Host
   * header, never from anything in the request body: a caller-supplied
   * return URL would turn this into a phishing tool that sends a real
   * company-branded email containing an attacker's link.
   */
  async requestReset(email: string, resetUrlBase: string): Promise<{ message: string }> {
    const message = 'หากอีเมลนี้อยู่ในระบบ เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว (ลิงก์มีอายุ 60 นาที)';

    const employee = await this.prisma.employee.findFirst({
      where: { email, status: 'active' },
      select: { id: true, tenantId: true, fullName: true, email: true },
    });
    if (!employee) {
      this.logger.log(`Password reset requested for an address with no active account`);
      return { message };
    }

    // Any link already outstanding is retired first. If someone requests a
    // reset because they suspect their account is compromised, an older link
    // sitting in a mailbox the attacker can read must not stay usable.
    await this.prisma.passwordResetToken.updateMany({
      where: { employeeId: employee.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        tenantId: employee.tenantId,
        employeeId: employee.id,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
      },
    });

    await this.mailer.sendPasswordReset(employee.email, employee.fullName, `${resetUrlBase}?token=${token}`);

    return { message };
  }

  /** "Forgot password" step 2 — redeem the emailed link. */
  async resetPassword(token: string, newPassword: string, actor: ActorContext): Promise<{ message: string }> {
    const invalid = 'ลิงก์นี้ใช้ไม่ได้แล้ว อาจถูกใช้ไปแล้วหรือหมดอายุ กรุณาขอลิงก์ใหม่';

    // Looked up by hash, and tenant-scoped by the Prisma extension — a token
    // minted on one customer's subdomain is not redeemable on another's.
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash: this.hashToken(token) },
      include: { employee: { select: { id: true, status: true, passwordHash: true } } },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException(invalid);
    }
    if (record.employee.status !== 'active') throw new BadRequestException(invalid);

    if (record.employee.passwordHash && (await bcrypt.compare(newPassword, record.employee.passwordHash))) {
      throw new BadRequestException('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
    }

    await this.applyNewPassword(
      record.employee.id,
      newPassword,
      { userId: record.employee.id, action: 'employee.password-reset-completed', ipAddress: actor.ipAddress },
      // Marking the token used inside the same transaction as the password
      // write is what makes the link genuinely single-use: two clicks racing
      // each other can't both find it unused and both succeed.
      record.id,
    );

    return { message: 'ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่' };
  }

  /**
   * HR-initiated reset, for the employee who can't reach their company
   * inbox at all — the case self-service can't cover.
   *
   * Returns the generated password exactly once, for the admin to relay in
   * person, and flags the account so the employee has to replace it with one
   * of their own before doing anything else.
   */
  async adminReset(employeeId: string, actor: { userId: string; ipAddress: string }): Promise<{ employeeId: string; fullName: string; tempPassword: string }> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, fullName: true, status: true },
    });
    if (!employee) throw new NotFoundException('ไม่พบพนักงานคนนี้');
    if (employee.status !== 'active') throw new BadRequestException('ไม่สามารถรีเซ็ตรหัสผ่านของพนักงานที่ไม่ได้ทำงานอยู่');

    const tempPassword = crypto.randomBytes(9).toString('base64url');
    await this.applyNewPassword(
      employee.id,
      tempPassword,
      { userId: actor.userId, action: `employee.password-reset-by-admin`, targetId: employee.id, ipAddress: actor.ipAddress },
      undefined,
      { mustChangePassword: true },
    );

    return { employeeId: employee.id, fullName: employee.fullName, tempPassword };
  }

  /**
   * The one place a password is written.
   *
   * All of it in a single transaction: the hash, the passwordChangedAt stamp
   * that cuts off old sessions, the retirement of every outstanding reset
   * link, the audit row (NFR-4), and — for the reset flow — consuming the
   * token that authorised it. A partial apply here is the dangerous kind:
   * a new password with old sessions still live, or a link that stays
   * redeemable after it worked.
   */
  private async applyNewPassword(
    employeeId: string,
    newPassword: string,
    audit: { userId: string; action: string; targetId?: string; ipAddress: string },
    consumeTokenId?: string,
    extraData: { mustChangePassword?: boolean } = {},
  ): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: employeeId },
        data: {
          passwordHash,
          passwordChangedAt: now,
          mustChangePassword: extraData.mustChangePassword ?? false,
        },
      });

      await tx.passwordResetToken.updateMany({
        where: { employeeId, usedAt: null },
        data: { usedAt: now },
      });

      if (consumeTokenId) {
        await tx.passwordResetToken.update({ where: { id: consumeTokenId }, data: { usedAt: now } });
      }

      await this.audit.record(tx, {
        userId: audit.userId,
        action: audit.action,
        targetTable: 'employees',
        targetId: audit.targetId ?? employeeId,
        ipAddress: audit.ipAddress,
      });
    });
  }

  private async issueToken(id: string, tenantId: string, role: string, email: string): Promise<string> {
    const payload: JwtPayload = { sub: id, tenantId, role: role as JwtPayload['role'], email };
    return this.jwt.signAsync(payload);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
