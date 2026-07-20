import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_API = 'https://api.line.me';

interface LineMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Sends LINE push messages (as opposed to replies — a reply token is
 * single-use and expires quickly, which doesn't fit a flow where an LLM
 * call or an approval-workflow transition sits between the triggering event
 * and the outbound message).
 */
@Injectable()
export class LineMessagingService {
  private readonly logger = new Logger(LineMessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async pushText(tenantId: string, lineUserId: string, text: string): Promise<void> {
    await this.push(tenantId, lineUserId, [{ type: 'text', text }], 'chatbot_reply');
  }

  /** Same delivery path as pushText, but for Flex Message cards (e.g. FR-3.1 approval notifications). */
  async pushFlex(
    tenantId: string,
    lineUserId: string,
    altText: string,
    contents: Record<string, unknown>,
    messageType: string,
    relatedRequestId?: string,
  ): Promise<void> {
    await this.push(tenantId, lineUserId, [{ type: 'flex', altText, contents }], messageType, relatedRequestId);
  }

  /**
   * FR-2.1: switches a single user's Rich Menu (e.g. to the "registered"
   * menu right after their OTP binding succeeds) — separate from the
   * channel-wide default set once by scripts/setup-line-rich-menu.ts.
   */
  async linkRichMenu(tenantId: string, lineUserId: string, richMenuId: string): Promise<void> {
    const accessToken = await this.getAccessToken(tenantId);
    if (!accessToken) return;

    try {
      const res = await fetch(`${LINE_API}/v2/bot/user/${lineUserId}/richmenu/${richMenuId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        this.logger.error(`Rich menu link failed for tenant ${tenantId}: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      this.logger.error(`Rich menu link threw for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Convenience wrapper for the one call site that needs it (post-OTP-binding) — looks up the tenant's saved "registered" menu id itself. */
  async linkRegisteredRichMenu(tenantId: string, lineUserId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { lineRichMenuRegisteredId: true } });
    if (!tenant?.lineRichMenuRegisteredId) return;
    await this.linkRichMenu(tenantId, lineUserId, tenant.lineRichMenuRegisteredId);
  }

  // Uses the *unscoped* PrismaService — Tenant isn't a tenant-scoped model,
  // same reasoning as LineSignatureGuard.
  //
  // NFR-2 note: lineChannelAccessTokenEnc is not actually encrypted yet
  // (same gap already flagged on lineChannelSecretEnc in
  // line-signature.guard.ts) — read directly as plaintext until AES-256
  // at-rest encryption for these columns is implemented.
  private async getAccessToken(tenantId: string): Promise<string | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { lineChannelAccessTokenEnc: true },
    });
    const accessToken = tenant?.lineChannelAccessTokenEnc;
    if (!accessToken) {
      this.logger.warn(`Tenant ${tenantId} has no LINE channel access token configured`);
      return null;
    }
    return accessToken;
  }

  private async push(
    tenantId: string,
    lineUserId: string,
    messages: LineMessage[],
    messageType: string,
    relatedRequestId?: string,
  ): Promise<void> {
    const accessToken = await this.getAccessToken(tenantId);
    if (!accessToken) return;

    let status = 'sent';
    try {
      const res = await fetch(LINE_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ to: lineUserId, messages }),
      });

      if (!res.ok) {
        status = 'failed';
        this.logger.error(`LINE push failed for tenant ${tenantId}: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      status = 'failed';
      this.logger.error(`LINE push threw for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // NotificationLog is tenant-scoped but this service intentionally uses
    // the unscoped PrismaService (see above), so tenantId is passed
    // explicitly rather than relying on the TENANT_PRISMA extension.
    await this.prisma.notificationLog.create({
      data: {
        tenantId,
        recipientLineUserId: lineUserId,
        messageType,
        relatedRequestId,
        status,
      },
    });
  }

  /** Base URL of the web-admin app the "🔎 ตรวจสอบ" button in Flex cards deep-links into (FR-3.1). */
  get webAdminUrl(): string {
    return this.config.get<string>('WEB_ADMIN_URL') ?? 'http://localhost:3000';
  }
}
