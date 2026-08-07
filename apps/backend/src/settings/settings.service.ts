import { Injectable } from '@nestjs/common';
import { ChatbotLeaveVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../crypto/encryption.service';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { UpdateLineConfigDto } from './dto/update-line-config.dto';
import { UpdateChatbotConfigDto } from './dto/update-chatbot-config.dto';

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
 * NFR-2: lineChannelSecretEnc/lineChannelAccessTokenEnc are AES-256-GCM
 * encrypted on write here and decrypted at the two read sites
 * (line-signature.guard.ts, line-messaging.service.ts) — this service never
 * returns the raw value itself, only "has it been set" booleans.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * Unauthenticated — see PublicTenantConfigController for why, and for the
   * rule that nothing secret may be added to this shape.
   */
  async getPublicTenantConfig() {
    const tenantId = getCurrentTenantId();
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { companyName: true, subdomain: true, lineLiffId: true },
    });

    return {
      companyName: tenant.companyName,
      subdomain: tenant.subdomain,
      liffId: tenant.lineLiffId,
    };
  }

  async getLineConfig() {
    const tenantId = getCurrentTenantId();
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { lineChannelId: true, lineLiffId: true, lineChannelSecretEnc: true, lineChannelAccessTokenEnc: true },
    });

    return {
      lineChannelId: tenant.lineChannelId,
      lineLiffId: tenant.lineLiffId,
      hasChannelSecret: !!tenant.lineChannelSecretEnc,
      hasChannelAccessToken: !!tenant.lineChannelAccessTokenEnc,
    };
  }

  async updateLineConfig(dto: UpdateLineConfigDto, actor: ActorContext) {
    const tenantId = getCurrentTenantId();

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });

      const beforeSecret = before.lineChannelSecretEnc ? this.encryption.decrypt(before.lineChannelSecretEnc) : null;
      const beforeAccessToken = before.lineChannelAccessTokenEnc ? this.encryption.decrypt(before.lineChannelAccessTokenEnc) : null;

      const data: Record<string, unknown> = {};
      if (dto.lineChannelId !== undefined && dto.lineChannelId !== before.lineChannelId) {
        data.lineChannelId = dto.lineChannelId;
      }
      if (dto.lineLiffId !== undefined && dto.lineLiffId !== before.lineLiffId) {
        data.lineLiffId = dto.lineLiffId;
      }
      if (dto.lineChannelSecret !== undefined && dto.lineChannelSecret !== beforeSecret) {
        data.lineChannelSecretEnc = this.encryption.encrypt(dto.lineChannelSecret);
      }
      if (dto.lineChannelAccessToken !== undefined && dto.lineChannelAccessToken !== beforeAccessToken) {
        data.lineChannelAccessTokenEnc = this.encryption.encrypt(dto.lineChannelAccessToken);
      }

      if (Object.keys(data).length === 0) {
        return {
          lineChannelId: before.lineChannelId,
          lineLiffId: before.lineLiffId,
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
        lineLiffId: updated.lineLiffId,
        hasChannelSecret: !!updated.lineChannelSecretEnc,
        hasChannelAccessToken: !!updated.lineChannelAccessTokenEnc,
      };
    });
  }

  /** Read by both the /settings page and ChatbotOrchestratorService (to decide whether an approver/employee's question is in scope). */
  async getChatbotConfig(): Promise<{ whoIsOnLeaveVisibility: ChatbotLeaveVisibility }> {
    const tenantId = getCurrentTenantId();
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { chatbotWhoIsOnLeaveVisibility: true },
    });
    return { whoIsOnLeaveVisibility: tenant.chatbotWhoIsOnLeaveVisibility };
  }

  async updateChatbotConfig(dto: UpdateChatbotConfigDto, actor: ActorContext) {
    const tenantId = getCurrentTenantId();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id: tenantId },
        data: { chatbotWhoIsOnLeaveVisibility: dto.whoIsOnLeaveVisibility },
      });

      await this.audit.record(tx, {
        userId: actor.userId,
        action: `tenant.chatbot-config-updated — who_is_on_leave_visibility=${dto.whoIsOnLeaveVisibility}`,
        targetTable: 'tenants',
        targetId: tenantId,
        ipAddress: actor.ipAddress,
        tenantId,
      });

      return { whoIsOnLeaveVisibility: updated.chatbotWhoIsOnLeaveVisibility };
    });
  }
}
