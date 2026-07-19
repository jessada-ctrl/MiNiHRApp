import { Body, Controller, HttpCode, Logger, Param, Post, UseGuards } from '@nestjs/common';
import { ChatbotOrchestratorService } from '../chatbot/chatbot-orchestrator.service';
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

/**
 * Dynamic per-tenant LINE webhook endpoint (FR-1.2):
 *   POST /v1/webhook/line/:tenantId
 *
 * TenantMiddleware has already resolved tenantId into the request context,
 * and LineSignatureGuard has verified the request actually came from LINE
 * (NFR-3) by the time this handler runs.
 *
 * Currently routes only plain-text `message` events to the HR chatbot.
 *
 * TODO before this can accept the rest of real traffic:
 *  - Route the remaining event types (postback, follow) to their handlers
 *    (FR-2.1 OTP binding flow, FR-2.3 attendance check-in, etc).
 */
@Controller('v1/webhook/line')
@UseGuards(LineSignatureGuard)
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly chatbotOrchestrator: ChatbotOrchestratorService) {}

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
      }
    }

    return { status: 'received' };
  }
}
