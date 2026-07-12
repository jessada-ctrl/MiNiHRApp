import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { getCurrentTenantId } from '../tenant/tenant-context';

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

/**
 * NFR-3: every LINE webhook call must be verified against the `x-line-signature`
 * header — HMAC-SHA256 of the raw request body, keyed with the tenant's LINE
 * Channel Secret, base64-encoded (this is LINE's documented signature scheme).
 * Without this, anyone who discovers a tenant's webhook URL (a fairly
 * guessable `/v1/webhook/line/{tenantId}` — see the TODO in
 * tenant.middleware.ts about not yet validating the id exists) could inject
 * arbitrary events as if they came from LINE.
 *
 * Uses the *unscoped* PrismaService, not TENANT_PRISMA — this runs before
 * we have any other reason to trust the caller, so it deliberately does its
 * own explicit `where: { id: tenantId }` lookup rather than relying on
 * tenant-context plumbing for this one trust-establishing check.
 *
 * NFR-2 note: Tenant.lineChannelSecretEnc is not actually encrypted yet
 * (the "Enc" suffix names the intent, not the current state) — AES-256
 * at-rest encryption for this column is a separate, not-yet-built piece of
 * NFR-2. Flagging rather than silently pretending it's done.
 */
@Injectable()
export class LineSignatureGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithRawBody>();

    const signature = req.header('x-line-signature');
    if (!signature) throw new UnauthorizedException('Missing x-line-signature header');

    if (!req.rawBody) {
      // Should never happen if main.ts's raw-body capture is wired correctly
      // for this route — fail closed rather than skip verification.
      throw new UnauthorizedException('Raw body unavailable for signature verification');
    }

    const tenantId = getCurrentTenantId();
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { lineChannelSecretEnc: true } });
    if (!tenant?.lineChannelSecretEnc) {
      throw new UnauthorizedException('This tenant has no LINE channel configured');
    }

    const expected = crypto.createHmac('sha256', tenant.lineChannelSecretEnc).update(req.rawBody).digest('base64');

    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);
    const valid = expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);

    if (!valid) throw new UnauthorizedException('Invalid LINE webhook signature');
    return true;
  }
}
