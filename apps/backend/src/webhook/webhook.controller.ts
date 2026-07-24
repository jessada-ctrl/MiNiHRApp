import { Body, Controller, HttpCode, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { ChatbotOrchestratorService } from '../chatbot/chatbot-orchestrator.service';
import { LineMessagingService } from '../line/line-messaging.service';
import { getCurrentTenantId } from '../tenant/tenant-context';
import { LineSignatureGuard } from './line-signature.guard';

interface LineWebhookEvent {
  type: string;
  message?: { type: string; text?: string };
  source?: { type: string; userId?: string };
}

interface LineWebhookBody {
  events?: LineWebhookEvent[];
}

const WELCOME_TEXT =
  'ยินดีต้อนรับสู่ LaLa\'! 👋\nกดปุ่ม "ลงทะเบียน" ที่เมนูด้านล่างแชทนี้ เพื่อผูกบัญชี LINE ของคุณเข้ากับข้อมูลพนักงาน — ใช้เวลาไม่ถึงนาที';

/**
 * Dynamic per-tenant LINE webhook endpoint (FR-1.2):
 *   POST /v1/webhook/line/:tenantId
 *
 * TenantMiddleware has already resolved tenantId into the request context,
 * and LineSignatureGuard has verified the request actually came from LINE
 * (NFR-3) by the time this handler runs.
 *
 * Routes plain-text `message` events to the HR chatbot, and `follow`
 * events (someone just added the OA as a friend) to a welcome message. The
 * Rich Menu itself isn't set here — the "unregistered" menu is the
 * channel-wide default (set once by scripts/setup-line-rich-menu.ts), so a
 * new follower sees it immediately without needing a per-user API call.
 *
 * TODO before this can accept the rest of real traffic:
 *  - Route `postback` events (FR-2.3 attendance check-in, etc).
 */
@Controller('v1/webhook/line')
@UseGuards(LineSignatureGuard)
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly chatbotOrchestrator: ChatbotOrchestratorService,
    private readonly lineMessaging: LineMessagingService,
  ) {}

  @Post(':tenantId')
  @HttpCode(200)
  handleLineWebhook(@Param('tenantId') tenantId: string, @Body() body: LineWebhookBody) {
    const tenantContextId = getCurrentTenantId();
    this.logger.log(`LINE webhook received for tenant ${tenantContextId} (path param: ${tenantId})`);

    for (const event of body?.events ?? []) {
      if (event.type === 'message' && event.message?.type === 'text' && event.source?.userId) {
        const lineUserId = event.source.userId;
        const text = event.message.text ?? '';

        // Not awaited: LINE requires a fast 200 OK regardless of payload
        // contents, and the chatbot reply is delivered asynchronously via
        // the Push Message API instead of blocking this response on an LLM
        // round trip. Still runs inside this request's tenant context — see
        // ChatbotOrchestratorService's doc comment.
        this.chatbotOrchestrator.handleTextMessage(lineUserId, text).catch((err) => {
          this.logger.error(
            `Chatbot handling failed for tenant ${tenantContextId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      } else if (event.type === 'follow' && event.source?.userId) {
        this.lineMessaging.pushText(tenantContextId, event.source.userId, WELCOME_TEXT).catch((err) => {
          this.logger.error(
            `Welcome push failed for tenant ${tenantContextId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
    }

    return { status: 'received' };
  }
}
