import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { UpdateLineConfigDto } from './dto/update-line-config.dto';

interface ActorContext {
  userId: string;
  ipAddress: string;
}

/**
 * FR-1.2: lets a Tenant Admin set their company's own LINE Messaging API
 * credentials, instead of the only current path (hardcoding fake values in
 * prisma/seed.ts).
 *
 * Uses the *unscoped* PrismaService, not TENANT_PRISMA — Tenant is excluded
 * from the tenant-scoping extension (it IS the tenant row), same reasoning
 * as line-messaging.service.ts and line-signature.guard.ts.
 *
 * NFR-2 note: lineChannelSecretEnc/lineChannelAccessTokenEnc are still
 * stored as plaintext despite the "Enc" naming — real AES-256 at-rest
 * encryption is a separate, not-yet-built piece of NFR-2.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getLineConfig() {
    const tenantId = getCurrentTenantId();
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { lineChannelId: true, lineChannelSecretEnc: true, lineChannelAccessTokenEnc: true },
    });

    return {
      lineChannelId: tenant.lineChannelId,
      hasChannelSecret: !!tenant.lineChannelSecretEnc,
      hasChannelAccessToken: !!tenant.lineChannelAccessTokenEnc,
    };
  }

  async updateLineConfig(dto: UpdateLineConfigDto, actor: ActorContext) {
    const tenantId = getCurrentTenantId();

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });

      const data: Record<string, unknown> = {};
      if (dto.lineChannelId !== undefined && dto.lineChannelId !== before.lineChannelId) {
        data.lineChannelId = dto.lineChannelId;
      }
      if (dto.lineChannelSecret !== undefined && dto.lineChannelSecret !== before.lineChannelSecretEnc) {
        data.lineChannelSecretEnc = dto.lineChannelSecret;
      }
      if (dto.lineChannelAccessToken !== undefined && dto.lineChannelAccessToken !== before.lineChannelAccessTokenEnc) {
        data.lineChannelAccessTokenEnc = dto.lineChannelAccessToken;
      }

      if (Object.keys(data).length === 0) {
        return {
          lineChannelId: before.lineChannelId,
          hasChannelSecret: !!before.lineChannelSecretEnc,
          hasChannelAccessToken: !!before.lineChannelAccessTokenEnc,
        };
      }

      const updated = await tx.tenant.update({ where: { id: tenantId }, data });

      // Never put the actual secret/token value in the audit trail — only that a change happened.
      // tenantId is passed explicitly because `tx` here comes from the *unscoped*
      // PrismaService (Tenant is excluded from tenant-scoping), so the extension
      // that normally auto-injects it on AuditLog.create never runs for this call.
      await this.audit.record(tx, {
        userId: actor.userId,
        action: 'tenant.line-config-updated',
        targetTable: 'tenants',
        targetId: tenantId,
        ipAddress: actor.ipAddress,
        tenantId,
      });

      return {
        lineChannelId: updated.lineChannelId,
        hasChannelSecret: !!updated.lineChannelSecretEnc,
        hasChannelAccessToken: !!updated.lineChannelAccessTokenEnc,
      };
    });
  }
}
