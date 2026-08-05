import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { AuditService } from '../audit/audit.service';
import { LineMessagingService } from '../line/line-messaging.service';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';
import { OtpMailerService } from './otp-mailer.service';

const OTP_TTL_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;
const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

interface ActorContext {
  ipAddress: string;
}

@Injectable()
export class LineAuthService {
  private readonly logger = new Logger(LineAuthService.name);

  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: PrismaClient,
    // Unscoped — Tenant isn't a tenant-scoped model, same reasoning as
    // LineMessagingService.getAccessToken / LineSignatureGuard.
    private readonly platformPrisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly mailer: OtpMailerService,
    private readonly lineMessaging: LineMessagingService,
  ) {}

  /**
   * FR-2.1 step 1: employee enters their code + company email in the LIFF
   * app; if they match an active employee, generate + email a 6-digit OTP.
   * Always returns the same generic message regardless of match, so this
   * endpoint can't be used to enumerate valid employeeCode/email pairs.
   *
   * BUG-007: an `otp_verifications` row is created (and `attempts` gets
   * incremented on wrong guesses) regardless of whether employeeCode+email
   * actually matched a real employee — only the *email send* is skipped for
   * a non-match. If row creation were conditional on a real match,
   * `verifyOtp` could tell a real pair from a fake one purely by whether a
   * row exists, defeating this endpoint's own anti-enumeration guarantee
   * the moment someone calls both endpoints in sequence. See `verifyOtp`
   * for the other half of this fix.
   */
  async requestOtp(employeeCode: string, email: string): Promise<{ message: string; devOtpCode?: string }> {
    const tenantId = getCurrentTenantId();
    const message = 'หากข้อมูลถูกต้อง ระบบได้ส่งรหัส OTP ไปยังอีเมลบริษัทของคุณแล้ว (หมดอายุใน 5 นาที)';

    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, employeeCode, email, status: 'active' },
      select: { id: true },
    });

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const otpCodeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await this.prisma.otpVerification.create({
      data: { tenantId, employeeId: employee?.id ?? null, employeeCode, email, otpCodeHash, expiresAt },
    });

    if (employee) await this.mailer.send(email, code);

    // No real email provider is wired up yet (see OtpMailerService) and
    // there's no reliable way to read the mock-logged code from outside the
    // container, so real device/browser testing has no way to learn the
    // code at all. Gated behind an explicit env flag (never set in
    // production) so this never ships as a real vulnerability — it's purely
    // a stand-in for "check your email" until a real provider exists.
    const devOtpCode = process.env.EXPOSE_OTP_FOR_TESTING === 'true' ? code : undefined;
    return { message, devOtpCode };
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
   *
   * BUG-007: the OTP row (looked up by employeeCode+email, not by employee
   * id) is checked — and its expiry/attempts/code compared — *before* ever
   * looking up whether a real employee backs it. Since `requestOtp` now
   * creates a row for every employeeCode+email pair regardless of match,
   * "no row found" only happens if `requestOtp` was never called for this
   * exact pair, which is equally true for a real and a fake pair — it no
   * longer signals which. The real-employee check only runs after a
   * correct code match, so guessing right on a fake pair (a ~1-in-1e6
   * chance, capped at 5 tries before lockout) is the only way to reach it —
   * an accepted residual risk for OTP-based systems, not a distinguishable
   * error path.
   */
  async verifyOtp(
    employeeCode: string,
    email: string,
    otpCode: string,
    lineUserId: string,
    actor: ActorContext,
  ): Promise<{ accessToken: string; user: AuthenticatedUser }> {
    const tenantId = getCurrentTenantId();
    const genericInvalid = 'Invalid employee code, email, or OTP';

    const otp = await this.prisma.otpVerification.findFirst({
      where: { tenantId, employeeCode, email, verifiedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new BadRequestException(genericInvalid);
    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Too many incorrect attempts — please request a new OTP');
    }
    if (otp.expiresAt < new Date()) throw new BadRequestException('OTP has expired — please request a new one');

    const codeOk = await bcrypt.compare(otpCode, otp.otpCodeHash);
    if (!codeOk) {
      await this.prisma.otpVerification.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Invalid OTP code');
    }

    // Only reachable with a correct code match — see the BUG-007 note above
    // for why the real-employee check has to live here, not earlier.
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, employeeCode, email, status: 'active' },
    });
    if (!employee) throw new BadRequestException(genericInvalid);

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

    // FR-2.1: switch this user's Rich Menu from "unregistered" to
    // "registered" now that binding succeeded. Fire-and-forget — a Rich
    // Menu API hiccup must never fail an otherwise-successful registration.
    this.lineMessaging.linkRegisteredRichMenu(employee.tenantId, lineUserId).catch((err) => {
      this.logger.error(`Rich menu switch failed after binding employee ${employee.id}: ${err instanceof Error ? err.message : String(err)}`);
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

  /**
   * Silent re-auth for an employee who already completed the OTP bind
   * (`verifyOtp`, above): a fresh LIFF ID token proves the caller currently
   * holds a live LINE session, so it can be exchanged directly for a new
   * app JWT — no OTP round-trip needed. This is what lets the LIFF app
   * recover from an expired 8h JWT (auth.module.ts's `expiresIn`) without
   * bouncing the employee to the email/password `/login` screen every time,
   * even though `employee.lineUserId` was bound the whole time.
   *
   * Unlike `verifyOtp` (which currently trusts a frontend-supplied
   * `lineUserId` at face value — see its doc comment), this endpoint
   * verifies the id_token's signature via LINE's own `/oauth2/v2.1/verify`
   * endpoint before trusting the `sub` claim as the caller's real LINE user
   * id — required here because there's no OTP step to anchor trust in.
   */
  async loginWithIdToken(idToken: string): Promise<{ accessToken: string; user: AuthenticatedUser }> {
    const tenantId = getCurrentTenantId();
    const lineUserId = await this.verifyLineIdToken(idToken, tenantId);

    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, lineUserId, status: 'active' },
    });
    if (!employee) {
      throw new UnauthorizedException('This LINE account is not linked to an active employee — please register again');
    }

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

  /**
   * Verifies an id_token against LINE's servers and returns its `sub`
   * (LINE user id) claim. `client_id` must be the LIFF app's LINE Login
   * channel id — the numeric prefix of the tenant's stored LIFF id
   * ("1234567890-abcdEFGh" -> "1234567890") — LINE itself rejects the
   * token (non-2xx) if its `aud` doesn't match, so a 2xx response here is
   * sufficient proof the token was genuinely issued for this tenant's LIFF
   * app and hasn't expired; no separate aud/exp check is needed.
   */
  private async verifyLineIdToken(idToken: string, tenantId: string): Promise<string> {
    const tenant = await this.platformPrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { lineLiffId: true },
    });
    const liffChannelId = tenant?.lineLiffId?.split('-')[0];
    if (!liffChannelId) {
      throw new UnauthorizedException('This tenant has no LIFF app configured');
    }

    let res: globalThis.Response;
    try {
      res = await fetch(LINE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: idToken, client_id: liffChannelId }).toString(),
      });
    } catch (err) {
      this.logger.error(`LINE id_token verify call threw: ${err instanceof Error ? err.message : String(err)}`);
      throw new UnauthorizedException('Could not verify LINE session — please try again');
    }

    if (!res.ok) {
      throw new UnauthorizedException('Invalid or expired LINE session — please sign in again');
    }

    const claims = (await res.json()) as { sub?: string };
    if (!claims.sub) {
      throw new UnauthorizedException('Invalid LINE session — please sign in again');
    }
    return claims.sub;
  }
}
