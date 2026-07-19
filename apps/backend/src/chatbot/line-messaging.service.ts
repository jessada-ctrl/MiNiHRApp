import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

/**
 * Sends LINE push messages (as opposed to replies — a reply token is
 * single-use and expires quickly, which doesn't fit a flow where an LLM
 * call sits between the inbound webhook and the outbound reply).
 */
@Injectable()
export class LineMessagingService {
  private readonly logger = new Logger(LineMessagingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async pushText(tenantId: string, lineUserId: string, text: string): Promise<void> {
    // Uses the *unscoped* PrismaService — Tenant isn't a tenant-scoped model,
    // same reasoning as LineSignatureGuard.
    //
    // NFR-2 note: lineChannelAccessTokenEnc is not actually encrypted yet
    // (same gap already flagged on lineChannelSecretEnc in
    // line-signature.guard.ts) — read directly as plaintext until AES-256
    // at-rest encryption for these columns is implemented.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { lineChannelAccessTokenEnc: true },
    });
    const accessToken = tenant?.lineChannelAccessTokenEnc;

    if (!accessToken) {
      this.logger.warn(`Tenant ${tenantId} has no LINE channel access token configured — cannot push message`);
      return;
    }

    let status = 'sent';
    try {
      const res = await fetch(LINE_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
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
        messageType: 'chatbot_reply',
        status,
      },
    });
  }
}
